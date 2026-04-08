import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAuth } from '../../auth/auth-guard.js';
import * as DeviceService from '../../devices/device-service.js';
import { isDeviceTrusted } from '../../devices/device-policy.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError, AuthError } from '../../app/errors.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await requireAuth(event.headers.Authorization || event.headers.authorization);

    const deviceId = event.headers['X-Device-Id'] || event.headers['x-device-id'];

    if (!deviceId) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing X-Device-Id header');
    }

    const devices = await DeviceService.listDevices(user.sub);
    const activeDevice = devices.find(d => d.deviceId === deviceId);

    if (!activeDevice || !isDeviceTrusted(activeDevice)) {
      throw new AuthError('AUTH_FORBIDDEN', 403);
    }

    return successResponse({
      sub: user.sub,
      email: user.email,
      username: user.username,
      tokenUse: user.tokenUse,
      accessAccepted: true
    }, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    console.error('Unhandled error in me:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
