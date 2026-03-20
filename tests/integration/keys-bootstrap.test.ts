import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { AppError } from '../../src/app/errors.js';
import { handler as bootstrapHandler } from '../../src/handlers/http/devices-bootstrap.js';
import * as AuthGuard from '../../src/auth/auth-guard.js';
import * as DeviceService from '../../src/devices/device-service.js';

vi.mock('../../src/auth/auth-guard.js');
vi.mock('../../src/devices/device-service.js');

function createEvent(pathUserId = 'user-1', pathDeviceId = 'dev-target'): APIGatewayProxyEvent {
  return {
    headers: {
      Authorization: 'Bearer token',
      'X-Device-Id': 'dev-actor',
    },
    body: null,
    httpMethod: 'GET',
    path: `/v1/users/${pathUserId}/devices/${pathDeviceId}/bootstrap`,
    pathParameters: {
      userId: pathUserId,
      deviceId: pathDeviceId,
    },
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: { requestId: 'req-2' } as any,
    resource: '',
    isBase64Encoded: false,
  };
}

describe('GET /v1/users/{userId}/devices/{deviceId}/bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AuthGuard.requireAuth).mockResolvedValue({ sub: 'user-1', tokenUse: 'access' });
  });

  it('returns current key-state envelope plus one one-time prekey', async () => {
    vi.mocked(DeviceService.getBootstrapBundle).mockResolvedValue({
      userId: 'user-1',
      deviceId: 'dev-target',
      identityKey: {
        keyId: 'ik-1',
        algorithm: 'X25519',
        publicKey: 'base64-public-identity',
      },
      signedPreKey: {
        keyId: 'spk-1',
        algorithm: 'Ed25519',
        publicKey: 'base64-public-signed-prekey',
        signature: 'base64-signature',
      },
      oneTimePreKey: {
        keyId: 'opk-1',
        algorithm: 'X25519',
        publicKey: 'base64-public-opk',
      },
    });

    const response = await bootstrapHandler(createEvent());

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body);
    expect(parsed.data.oneTimePreKey.keyId).toBe('opk-1');
    expect(parsed.data.identityKey.keyId).toBe('ik-1');
  });

  it('returns 403 when caller user does not match path user', async () => {
    vi.mocked(DeviceService.getBootstrapBundle).mockRejectedValue(
      new AppError('AUTH_FORBIDDEN', 'Device not found or not owned by caller', 403),
    );

    const response = await bootstrapHandler(createEvent('user-2'));

    expect(response.statusCode).toBe(403);
    const parsed = JSON.parse(response.body);
    expect(parsed.error.code).toBe('AUTH_FORBIDDEN');
  });

  it('returns 409 conflict when one-time prekey pool is exhausted', async () => {
    vi.mocked(DeviceService.getBootstrapBundle).mockRejectedValue(
      new AppError('CONFLICT', 'No one-time prekeys available', 409),
    );

    const response = await bootstrapHandler(createEvent());

    expect(response.statusCode).toBe(409);
    const parsed = JSON.parse(response.body);
    expect(parsed.error.code).toBe('CONFLICT');
  });
});