import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ConnectionRegistry from '../../src/realtime/connection-registry.js';
import {
  publishMembershipEvent,
  publishMembershipReplayComplete,
} from '../../src/realtime/group-relay-publisher.js';

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

describe('group-relay-publisher', () => {
  let originalManagementEndpoint: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    sendSpy.mockReset();
    originalManagementEndpoint = process.env.WEBSOCKET_MANAGEMENT_ENDPOINT;
    process.env.WEBSOCKET_MANAGEMENT_ENDPOINT = 'https://ws.example.test';
  });

  afterEach(() => {
    if (typeof originalManagementEndpoint === 'undefined') {
      delete process.env.WEBSOCKET_MANAGEMENT_ENDPOINT;
      return;
    }

    process.env.WEBSOCKET_MANAGEMENT_ENDPOINT = originalManagementEndpoint;
  });

  it('returns delivered when at least one membership relay succeeds', async () => {
    vi.mocked(ConnectionRegistry.listDeviceConnections).mockResolvedValue([
      { userId: 'user-1', deviceId: 'device-1', connectionId: 'conn-1' },
    ]);
    sendSpy.mockResolvedValue({});

    const outcome = await publishMembershipEvent('user-1', 'device-1', {
      eventType: 'group-membership-event',
      eventId: 'mev-group-1-0001',
      groupId: 'group-1',
      changeType: 'member-joined',
      actorUserId: 'actor-1',
      targetUserId: 'target-1',
      serverTimestamp: '2026-04-02T10:00:00.000Z',
    });

    expect(outcome).toBe('delivered');
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('returns accepted-queued when no active device connection exists', async () => {
    vi.mocked(ConnectionRegistry.listDeviceConnections).mockResolvedValue([]);

    const outcome = await publishMembershipEvent('user-1', 'device-1', {
      eventType: 'group-membership-event',
      eventId: 'mev-group-1-0001',
      groupId: 'group-1',
      changeType: 'member-joined',
      actorUserId: 'actor-1',
      targetUserId: 'target-1',
      serverTimestamp: '2026-04-02T10:00:00.000Z',
    });

    expect(outcome).toBe('accepted-queued');
  });

  it('cleans up stale connections on GoneException', async () => {
    vi.mocked(ConnectionRegistry.listDeviceConnections).mockResolvedValue([
      { userId: 'user-1', deviceId: 'device-1', connectionId: 'stale-1' },
    ]);
    vi.mocked(ConnectionRegistry.removeConnection).mockResolvedValue();
    sendSpy.mockRejectedValue({ name: 'GoneException' });

    const outcome = await publishMembershipEvent('user-1', 'device-1', {
      eventType: 'group-membership-event',
      eventId: 'mev-group-1-0001',
      groupId: 'group-1',
      changeType: 'member-joined',
      actorUserId: 'actor-1',
      targetUserId: 'target-1',
      serverTimestamp: '2026-04-02T10:00:00.000Z',
    });

    expect(outcome).toBe('accepted-queued');
    expect(ConnectionRegistry.removeConnection).toHaveBeenCalledWith('user-1', 'stale-1');
  });

  it('publishes group replay-complete event', async () => {
    vi.mocked(ConnectionRegistry.listDeviceConnections).mockResolvedValue([
      { userId: 'user-1', deviceId: 'device-1', connectionId: 'conn-1' },
    ]);
    sendSpy.mockResolvedValue({});

    await publishMembershipReplayComplete('user-1', 'device-1', 3);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const postCommand = sendSpy.mock.calls[0][0];
    const body = JSON.parse(new TextDecoder().decode(postCommand.input.Data));
    expect(body).toMatchObject({
      eventType: 'group-replay-complete',
      deviceId: 'device-1',
      eventsReplayed: 3,
    });
  });
});
