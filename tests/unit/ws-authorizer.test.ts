import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/auth/auth-guard.js');
vi.mock('../../src/devices/device-service.js');

import { requireAuth } from '../../src/auth/auth-guard.js';
import * as DeviceService from '../../src/devices/device-service.js';
import { DeviceStatus } from '../../src/devices/device-model.js';
import { handler } from '../../src/handlers/ws/authorizer.js';

describe('ws authorizer', () => {
  let originalStage: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalStage = process.env.STAGE;
    process.env.STAGE = 'staging';
  });

  afterEach(() => {
    if (originalStage === undefined) {
      delete process.env.STAGE;
    } else {
      process.env.STAGE = originalStage;
    }
  });

  it('authorizes valid header token + trusted device', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ sub: 'user-1', tokenUse: 'access' });
    vi.mocked(DeviceService.listDevices).mockResolvedValue([
      {
        userId: 'user-1',
        deviceId: 'dev-1',
        status: DeviceStatus.TRUSTED,
        registeredAt: '2026-04-01T00:00:00.000Z',
        lastSeenAt: '2026-04-01T00:00:00.000Z',
      },
    ] as any);

    const result = await handler({
      methodArn: 'arn:aws:execute-api:ap-southeast-1:123456789012:api-id/production/$connect',
      headers: { Authorization: 'Bearer token' },
      queryStringParameters: { deviceId: 'dev-1' },
    });

    expect(result.principalId).toBe('user-1');
    expect(result.policyDocument.Statement[0]?.Effect).toBe('Allow');
    expect(result.context).toEqual({
      userId: 'user-1',
      deviceId: 'dev-1',
    });
  });

  it('rejects query-token fallback in production', async () => {
    process.env.STAGE = 'production';

    const result = await handler({
      methodArn: 'arn:aws:execute-api:ap-southeast-1:123456789012:api-id/production/$connect',
      headers: null,
      queryStringParameters: { token: 'x', deviceId: 'dev-1' },
    });

    expect(result.policyDocument.Statement[0]?.Effect).toBe('Deny');
  });

  it('rejects untrusted device', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ sub: 'user-1', tokenUse: 'access' });
    vi.mocked(DeviceService.listDevices).mockResolvedValue([
      {
        userId: 'user-1',
        deviceId: 'dev-1',
        status: DeviceStatus.REVOKED,
        registeredAt: '2026-04-01T00:00:00.000Z',
        lastSeenAt: '2026-04-01T00:00:00.000Z',
      },
    ] as any);

    const result = await handler({
      methodArn: 'arn:aws:execute-api:ap-southeast-1:123456789012:api-id/production/$connect',
      headers: { Authorization: 'Bearer token' },
      queryStringParameters: { deviceId: 'dev-1' },
    });

    expect(result.policyDocument.Statement[0]?.Effect).toBe('Deny');
  });

  it('uses routeArn when methodArn is missing', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ sub: 'user-1', tokenUse: 'access' });
    vi.mocked(DeviceService.listDevices).mockResolvedValue([
      {
        userId: 'user-1',
        deviceId: 'dev-1',
        status: DeviceStatus.TRUSTED,
        registeredAt: '2026-04-01T00:00:00.000Z',
        lastSeenAt: '2026-04-01T00:00:00.000Z',
      },
    ] as any);

    const routeArn = 'arn:aws:execute-api:ap-southeast-1:123456789012:api-id/production/$connect';
    const result = await handler({
      routeArn,
      headers: { Authorization: 'Bearer token' },
      queryStringParameters: { deviceId: 'dev-1' },
    });

    expect(result.policyDocument.Statement[0]?.Resource).toBe(routeArn);
    expect(result.policyDocument.Statement[0]?.Effect).toBe('Allow');
  });
});
