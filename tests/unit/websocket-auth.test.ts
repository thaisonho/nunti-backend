import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/auth/auth-guard.js');
vi.mock('../../src/devices/device-service.js');

import { requireAuth } from '../../src/auth/auth-guard.js';
import * as DeviceService from '../../src/devices/device-service.js';
import { extractWebSocketContext } from '../../src/auth/websocket-auth.js';
import { DeviceStatus } from '../../src/devices/device-model.js';

describe('websocket-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts user and device context from connection event with query string token', async () => {
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
