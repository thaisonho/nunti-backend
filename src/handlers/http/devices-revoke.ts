import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireHttpAuthContext } from './http-auth-context.js';
import * as DeviceService from '../../devices/device-service.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';
import * as AuditService from '../../audit/audit-service.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await requireHttpAuthContext(event);

    const deviceId = event.pathParameters?.deviceId;
    if (!deviceId) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing deviceId in path parameter');
    }

    const device = await DeviceService.revokeDevice(user.sub, deviceId);

    AuditService.deviceRevoked(
      user.sub,
      deviceId,
      event.requestContext?.identity?.sourceIp,
    );

    return successResponse(device, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    console.error('Unhandled error in devices-revoke:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
