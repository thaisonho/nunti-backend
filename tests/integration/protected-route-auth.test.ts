import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler as meHandler } from '../../src/handlers/http/me.js';
import * as AuthGuard from '../../src/auth/auth-guard.js';
import { AuthError } from '../../src/app/errors.js';
import { DeviceStatus } from '../../src/devices/device-model.js';
import * as DeviceService from '../../src/devices/device-service.js';

vi.mock('../../src/auth/auth-guard.js');
vi.mock('../../src/devices/device-service.js');

function createEvent(headers: Record<string, string>): APIGatewayProxyEvent {
  return {
    headers,
    body: null,
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/v1/me',
    pathParameters: null,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: { requestId: 'test-req-id' } as any,
    resource: ''
  };
}

describe('Protected Route Auth Probe (/v1/me)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts valid JWT and trusted device', async () => {
    vi.mocked(AuthGuard.requireAuth).mockResolvedValue({ sub: 'user-1', tokenUse: 'access' });
    vi.mocked(DeviceService.listDevices).mockResolvedValue([
      { userId: 'user-1', deviceId: 'dev-1', status: DeviceStatus.TRUSTED, registeredAt: '', lastSeenAt: '' }
    ]);

    const event = createEvent({ Authorization: 'Bearer valid-token', 'X-Device-Id': 'dev-1' });
    const response = await meHandler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.sub).toBe('user-1');
  });

  it('returns 401 AUTH_TOKEN_MISSING_OR_MALFORMED for missing header', async () => {
    vi.mocked(AuthGuard.requireAuth).mockRejectedValue(new AuthError('AUTH_TOKEN_MISSING_OR_MALFORMED', 401));

    const event = createEvent({});
    const response = await meHandler(event);

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('AUTH_TOKEN_MISSING_OR_MALFORMED');
  });

  it('rejects revoked device with 403 AUTH_FORBIDDEN', async () => {
    vi.mocked(AuthGuard.requireAuth).mockResolvedValue({ sub: 'user-1', tokenUse: 'access' });
    // Simulate revoked device returned by device service or policy helper inside meHandler
    vi.mocked(DeviceService.listDevices).mockResolvedValue([
      { userId: 'user-1', deviceId: 'dev-1', status: DeviceStatus.REVOKED, registeredAt: '', lastSeenAt: '' }
    ]);

    const event = createEvent({ Authorization: 'Bearer valid-token', 'X-Device-Id': 'dev-1' });
    const response = await meHandler(event);

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('AUTH_FORBIDDEN');
  });
});
