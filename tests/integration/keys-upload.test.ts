import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { AppError } from '../../src/app/errors.js';
import { handler as uploadKeysHandler } from '../../src/handlers/http/devices-keys.js';
import * as AuthGuard from '../../src/auth/auth-guard.js';
import * as DeviceService from '../../src/devices/device-service.js';
import { DeviceStatus } from '../../src/devices/device-model.js';

vi.mock('../../src/auth/auth-guard.js');
vi.mock('../../src/devices/device-service.js');

function createEvent(body: Record<string, unknown> | null): APIGatewayProxyEvent {
  return {
    headers: {
      Authorization: 'Bearer token',
      'X-Device-Id': 'dev-actor',
    },
    body: body ? JSON.stringify(body) : null,
    httpMethod: 'PUT',
    isBase64Encoded: false,
    path: '/v1/devices/dev-target/keys',
    pathParameters: { deviceId: 'dev-target' },
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: { requestId: 'req-1' } as any,
    resource: '',
  };
}

describe('PUT /v1/devices/{deviceId}/keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AuthGuard.requireAuth).mockResolvedValue({ sub: 'user-1', tokenUse: 'access' });
  });

  it('accepts valid payload and returns current key state', async () => {
    vi.mocked(DeviceService.uploadDeviceKeys).mockResolvedValue({
      userId: 'user-1',
      deviceId: 'dev-target',
      status: DeviceStatus.TRUSTED,
      registeredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      keyStateUpdatedAt: new Date().toISOString(),
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
    });

    const response = await uploadKeysHandler(
      createEvent({
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
      }),
    );

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body);
    expect(parsed.data.deviceId).toBe('dev-target');
    expect(parsed.data.identityKey.keyId).toBe('ik-1');
    expect(parsed.data.signedPreKey.keyId).toBe('spk-1');
  });

  it('returns 400 when request body is missing', async () => {
    const response = await uploadKeysHandler(createEvent(null));

    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body);
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when payload schema is invalid', async () => {
    const response = await uploadKeysHandler(createEvent({ signedPreKey: {} }));

    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body);
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
  });

  it('maps AppError from service without changing error contract', async () => {
    vi.mocked(DeviceService.uploadDeviceKeys).mockRejectedValue(
      new AppError('AUTH_FORBIDDEN', 'Device not found or not owned by caller', 403),
    );

    const response = await uploadKeysHandler(
      createEvent({
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
      }),
    );

    expect(response.statusCode).toBe(403);
    const parsed = JSON.parse(response.body);
    expect(parsed.error.code).toBe('AUTH_FORBIDDEN');
  });
});