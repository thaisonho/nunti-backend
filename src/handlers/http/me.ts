import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireHttpAuthContext } from './http-auth-context.js';
import * as DeviceService from '../../devices/device-service.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError, AuthError } from '../../app/errors.js';
import { DeviceStatus } from '../../devices/device-model.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await requireHttpAuthContext(event);

    const deviceId = event.headers['X-Device-Id'] || event.headers['x-device-id'];

    if (!deviceId) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing X-Device-Id header');
    }

    const devices = await DeviceService.listDevices(user.sub);
    const activeDevice = devices.find(d => d.deviceId === deviceId);

    if (!activeDevice || activeDevice.status === DeviceStatus.REVOKED) {
      throw new AuthError('AUTH_FORBIDDEN', 403);
    }

    return successResponse({
      sub: user.sub,
      email: user.email,
      username: user.username,
      tokenUse: user.tokenUse,
      isAdmin: user.isAdmin,
      accessAccepted: activeDevice.status === DeviceStatus.TRUSTED,
    }, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    console.error('Unhandled error in me:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
