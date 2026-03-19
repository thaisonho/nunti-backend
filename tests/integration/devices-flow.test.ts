import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler as registerHandler } from '../../src/handlers/http/devices-register.js';
import { handler as listHandler } from '../../src/handlers/http/devices-list.js';
import { handler as revokeHandler } from '../../src/handlers/http/devices-revoke.js';
import * as AuthGuard from '../../src/auth/auth-guard.js';
import * as DeviceService from '../../src/devices/device-service.js';
import { DeviceStatus } from '../../src/devices/device-model.js';
import { AppError } from '../../src/app/errors.js';

vi.mock('../../src/auth/auth-guard.js');
vi.mock('../../src/devices/device-service.js');

function createEvent(method: string, path: string, headers: Record<string, string>, body: Record<string, unknown> | null, pathParams: Record<string, string> | null = null): APIGatewayProxyEvent {
  return {
    headers,
    body: body ? JSON.stringify(body) : null,
    httpMethod: method,
    isBase64Encoded: false,
    path,
    pathParameters: pathParams,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: { requestId: 'test-req-id' } as any,
    resource: ''
  };
}

describe('Device Endpoints Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AuthGuard.requireAuth).mockResolvedValue({ sub: 'user-1', tokenUse: 'access' });
  });

  describe('POST /v1/devices/register', () => {
    it('registers trusted device successfully', async () => {
      vi.mocked(DeviceService.registerDevice).mockResolvedValue({
        userId: 'user-1',
        deviceId: 'dev-1',
        deviceLabel: 'iPhone',
        platform: 'iOS',
        appVersion: '1.0',
        status: DeviceStatus.TRUSTED,
        registeredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      });

      const event = createEvent('POST', '/v1/devices/register', { Authorization: 'Bearer token' }, {
        deviceId: 'dev-1',
        deviceLabel: 'iPhone',
        platform: 'iOS',
        appVersion: '1.0'
      });

      const response = await registerHandler(event);
      expect(response.statusCode).toBe(201);
      const parsed = JSON.parse(response.body);
      expect(parsed.data.deviceId).toBe('dev-1');
      expect(parsed.data.status).toBe('trusted');
    });

    it('returns 400 for missing deviceId', async () => {
      const event = createEvent('POST', '/v1/devices/register', { Authorization: 'Bearer token' }, {
        deviceLabel: 'iPhone'
      });
      const response = await registerHandler(event);
      expect(response.statusCode).toBe(400);
      const parsed = JSON.parse(response.body);
      expect(parsed.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /v1/devices', () => {
    it('returns list of devices', async () => {
      vi.mocked(DeviceService.listDevices).mockResolvedValue([{
        userId: 'user-1',
        deviceId: 'dev-1',
        deviceLabel: 'iPhone',
        platform: 'iOS',
        status: DeviceStatus.TRUSTED,
        registeredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      }]);

      const event = createEvent('GET', '/v1/devices', { Authorization: 'Bearer token' }, null);
      const response = await listHandler(event);
      expect(response.statusCode).toBe(200);
      const parsed = JSON.parse(response.body);
      expect(parsed.data).toHaveLength(1);
    });
  });

  describe('POST /v1/devices/{deviceId}/revoke', () => {
    it('revokes device and returns 200', async () => {
      vi.mocked(DeviceService.revokeDevice).mockResolvedValue({
        userId: 'user-1',
        deviceId: 'dev-1',
        status: DeviceStatus.REVOKED,
        registeredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        revokedAt: new Date().toISOString()
      });

      const event = createEvent('POST', '/v1/devices/dev-1/revoke', { Authorization: 'Bearer token' }, null, { deviceId: 'dev-1' });
      const response = await revokeHandler(event);
      expect(response.statusCode).toBe(200);
      const parsed = JSON.parse(response.body);
      expect(parsed.data.status).toBe('revoked');
    });

    it('returns 403 on forbidden/unowned device exception', async () => {
      vi.mocked(DeviceService.revokeDevice).mockRejectedValue(new AppError('AUTH_FORBIDDEN', 'Device not found or not owned by caller', 403));

      const event = createEvent('POST', '/v1/devices/dev-other/revoke', { Authorization: 'Bearer token' }, null, { deviceId: 'dev-other' });
      const response = await revokeHandler(event);
      expect(response.statusCode).toBe(403);
      const parsed = JSON.parse(response.body);
      expect(parsed.error.code).toBe('AUTH_FORBIDDEN');
    });
  });
});
