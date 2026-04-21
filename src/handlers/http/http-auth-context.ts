import type { APIGatewayProxyEvent } from 'aws-lambda';
import { requireAuth, type AuthenticatedUser } from '../../auth/auth-guard.js';
import { AppError, AuthError } from '../../app/errors.js';
import * as DeviceService from '../../devices/device-service.js';
import { isDeviceTrusted } from '../../devices/device-policy.js';

export interface TrustedHttpAuthContext {
  user: AuthenticatedUser;
  deviceId: string;
}

export async function requireTrustedDeviceAuth(
  event: APIGatewayProxyEvent,
): Promise<TrustedHttpAuthContext> {
  const user = await requireAuth(event.headers.Authorization || event.headers.authorization);

  const deviceId = event.headers['X-Device-Id'] || event.headers['x-device-id'];
  if (!deviceId) {
    throw new AppError('VALIDATION_ERROR', 'Missing X-Device-Id header', 400);
  }

  const devices = await DeviceService.listDevices(user.sub);
  const activeDevice = devices.find((device) => device.deviceId === deviceId);
  if (!activeDevice || !isDeviceTrusted(activeDevice)) {
    throw new AuthError('AUTH_FORBIDDEN', 403);
  }

  return {
    user,
    deviceId,
  };
}
