import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as ConnectionRegistry from '../../src/realtime/connection-registry.js';
import { publishTrustChange } from '../../src/realtime/trust-change-publisher.js';

vi.mock('../../src/realtime/connection-registry.js');

const sendSpy = vi.fn();

vi.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: class {
    send = sendSpy;
  },
  PostToConnectionCommand: class {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

describe('trust-change publisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendSpy.mockReset();
    process.env.WEBSOCKET_MANAGEMENT_ENDPOINT = 'https://ws.example.test';
  });

  it('fans out minimal trust-change payload to same-account active connections', async () => {
    vi.mocked(ConnectionRegistry.listActiveConnections).mockResolvedValue([
      { userId: 'user-1', connectionId: 'conn-1' },
      { userId: 'user-1', connectionId: 'conn-2' },
    ]);
    sendSpy.mockResolvedValue({});

    await publishTrustChange('user-1', {
      changeType: 'keys-updated',
      deviceId: 'dev-target',
      timestamp: '2026-03-20T10:00:00.000Z',
    });

    expect(sendSpy).toHaveBeenCalledTimes(2);
  });

  it('removes stale connection when delivery fails with gone exception', async () => {
    vi.mocked(ConnectionRegistry.listActiveConnections).mockResolvedValue([
      { userId: 'user-1', connectionId: 'stale-conn' },
    ]);
    vi.mocked(ConnectionRegistry.removeConnection).mockResolvedValue();
    sendSpy.mockRejectedValue({ name: 'GoneException' });

    await publishTrustChange('user-1', {
      changeType: 'device-revoked',
      deviceId: 'dev-target',
      timestamp: '2026-03-20T10:01:00.000Z',
    });

    expect(ConnectionRegistry.removeConnection).toHaveBeenCalledWith('user-1', 'stale-conn');
  });
});