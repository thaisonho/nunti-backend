import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/auth/auth-guard.js');
vi.mock('../../src/devices/device-service.js');

import { requireAuth } from '../../src/auth/auth-guard.js';
import * as DeviceService from '../../src/devices/device-service.js';
import { extractWebSocketContext } from '../../src/auth/websocket-auth.js';
import { DeviceStatus } from '../../src/devices/device-model.js';

describe('websocket-auth', () => {
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

  it('extracts user and device context from connection event with query string token (non-prod)', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      sub: 'user-123',
      tokenUse: 'access',
    });
    vi.mocked(DeviceService.listDevices).mockResolvedValue([
      {
        userId: 'user-123',
        deviceId: 'device-456',
        status: DeviceStatus.TRUSTED,
        registeredAt: '2026-04-01T00:00:00.000Z',
        lastSeenAt: '2026-04-01T00:00:00.000Z',
      },
    ] as any);

    const event = {
      requestContext: { connectionId: 'conn-abc' },
      queryStringParameters: {
        token: 'valid-jwt-token',
        deviceId: 'device-456',
      },
      headers: null,
    };

    const ctx = await extractWebSocketContext(event as any);

    expect(ctx).toEqual({
      userId: 'user-123',
      deviceId: 'device-456',
      connectionId: 'conn-abc',
    });
    expect(requireAuth).toHaveBeenCalledWith('Bearer valid-jwt-token');
  });

  it('extracts user and device context from Authorization header', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      sub: 'user-789',
      tokenUse: 'access',
    });
    vi.mocked(DeviceService.listDevices).mockResolvedValue([
      {
        userId: 'user-789',
        deviceId: 'device-012',
        status: DeviceStatus.TRUSTED,
        registeredAt: '2026-04-01T00:00:00.000Z',
        lastSeenAt: '2026-04-01T00:00:00.000Z',
      },
    ] as any);

    const event = {
      requestContext: { connectionId: 'conn-def' },
      headers: { Authorization: 'Bearer header-jwt-token' },
      queryStringParameters: { deviceId: 'device-012' },
    };

    const ctx = await extractWebSocketContext(event as any);

    expect(ctx).toEqual({
      userId: 'user-789',
      deviceId: 'device-012',
      connectionId: 'conn-def',
    });
    expect(requireAuth).toHaveBeenCalledWith('Bearer header-jwt-token');
  });

  it('prefers Authorization header over query string token', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      sub: 'user-1',
      tokenUse: 'access',
    });
    vi.mocked(DeviceService.listDevices).mockResolvedValue([
      {
        userId: 'user-1',
        deviceId: 'dev-1',
        status: DeviceStatus.TRUSTED,
        registeredAt: '2026-04-01T00:00:00.000Z',
        lastSeenAt: '2026-04-01T00:00:00.000Z',
      },
    ] as any);

    const event = {
      requestContext: { connectionId: 'conn-1' },
      headers: { Authorization: 'Bearer header-token' },
      queryStringParameters: { token: 'query-token', deviceId: 'dev-1' },
    };

    await extractWebSocketContext(event as any);

    expect(requireAuth).toHaveBeenCalledWith('Bearer header-token');
  });

  it('rejects query-token fallback in production with AUTH_TOKEN_MISSING_OR_MALFORMED', async () => {
    process.env.STAGE = 'production';

    const event = {
      requestContext: { connectionId: 'conn-prod' },
      queryStringParameters: {
        token: 'valid-jwt-token',
        deviceId: 'device-456',
      },
      headers: null,
    };

    await expect(extractWebSocketContext(event as any)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_MISSING_OR_MALFORMED',
      statusCode: 401,
    });

    // requireAuth should NOT be called — rejected before verification
    expect(requireAuth).not.toHaveBeenCalled();
  });

  it('accepts Authorization header in production', async () => {
    process.env.STAGE = 'production';

    vi.mocked(requireAuth).mockResolvedValue({
      sub: 'user-prod',
      tokenUse: 'access',
    });
    vi.mocked(DeviceService.listDevices).mockResolvedValue([
      {
        userId: 'user-prod',
        deviceId: 'dev-prod',
        status: DeviceStatus.TRUSTED,
        registeredAt: '2026-04-01T00:00:00.000Z',
        lastSeenAt: '2026-04-01T00:00:00.000Z',
      },
    ] as any);

    const event = {
      requestContext: { connectionId: 'conn-prod' },
      headers: { Authorization: 'Bearer prod-header-token' },
      queryStringParameters: { deviceId: 'dev-prod' },
    };

    const ctx = await extractWebSocketContext(event as any);

    expect(ctx).toEqual({
      userId: 'user-prod',
      deviceId: 'dev-prod',
      connectionId: 'conn-prod',
    });
  });

  it('throws when deviceId is missing from query parameters', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      sub: 'user-123',
      tokenUse: 'access',
    });

    const event = {
      requestContext: { connectionId: 'conn-abc' },
      queryStringParameters: { token: 'valid-jwt-token' },
      headers: null,
    };

    await expect(extractWebSocketContext(event as any)).rejects.toThrow();
  });

  it('throws when auth verification fails', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Authentication failed'));

    const event = {
      requestContext: { connectionId: 'conn-abc' },
      queryStringParameters: { token: 'invalid-token', deviceId: 'device-456' },
      headers: null,
    };

    await expect(extractWebSocketContext(event as any)).rejects.toThrow('Authentication failed');
  });

  it('throws when no token source is available', async () => {
    const event = {
      requestContext: { connectionId: 'conn-abc' },
      queryStringParameters: { deviceId: 'device-456' },
      headers: null,
    };

    vi.mocked(requireAuth).mockRejectedValue(new Error('Authentication failed'));

    await expect(extractWebSocketContext(event as any)).rejects.toThrow();
  });

  it('throws when device is not found for the authenticated user', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      sub: 'user-123',
      tokenUse: 'access',
    });
    vi.mocked(DeviceService.listDevices).mockResolvedValue([] as any);

    const event = {
      requestContext: { connectionId: 'conn-abc' },
      queryStringParameters: { token: 'valid-jwt-token', deviceId: 'missing-device' },
      headers: null,
    };

    await expect(extractWebSocketContext(event as any)).rejects.toThrow('Authentication failed');
  });

  it('throws when device is revoked', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      sub: 'user-123',
      tokenUse: 'access',
    });
    vi.mocked(DeviceService.listDevices).mockResolvedValue([
      {
        userId: 'user-123',
        deviceId: 'device-456',
        status: DeviceStatus.REVOKED,
        registeredAt: '2026-04-01T00:00:00.000Z',
        lastSeenAt: '2026-04-01T00:00:00.000Z',
        revokedAt: '2026-04-02T00:00:00.000Z',
      },
    ] as any);

    const event = {
      requestContext: { connectionId: 'conn-abc' },
      queryStringParameters: { token: 'valid-jwt-token', deviceId: 'device-456' },
      headers: null,
    };

    await expect(extractWebSocketContext(event as any)).rejects.toThrow('Authentication failed');
  });
});
