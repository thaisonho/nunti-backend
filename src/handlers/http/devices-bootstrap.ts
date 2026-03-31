import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAuth } from '../../auth/auth-guard.js';
import * as DeviceService from '../../devices/device-service.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await requireAuth(event.headers.Authorization || event.headers.authorization);

    const actorDeviceId = event.headers['X-Device-Id'] || event.headers['x-device-id'];
    if (!actorDeviceId) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing X-Device-Id header');
    }

    const userId = event.pathParameters?.userId;
    const deviceId = event.pathParameters?.deviceId;
    if (!userId || !deviceId) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing userId or deviceId in path parameter');
    }

    const bundle = await DeviceService.getBootstrapBundle({
      actorUserId: user.sub,
      actorDeviceId,
      targetUserId: userId,
      targetDeviceId: deviceId,
    });

    return successResponse(bundle, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    console.error('Unhandled error in devices-bootstrap:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
