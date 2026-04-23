import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAuth } from '../../auth/auth-guard.js';
import * as DeviceService from '../../devices/device-service.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';

/**
 * List devices for a specific user (cross-user device discovery).
 * Required for Signal Protocol E2EE session establishment.
 * Returns only public device information (no keys).
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await requireAuth(event.headers.Authorization || event.headers.authorization);

    const userId = event.pathParameters?.userId;
    if (!userId) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing userId in path parameter');
    }

    const devices = await DeviceService.listDevices(userId);
    
    // Return only public device info (no keys) and only trusted devices
    const publicDevices = devices
      .filter(d => d.status === 'trusted')
      .map(d => ({
        deviceId: d.deviceId,
        platform: d.platform,
        status: d.status,
        lastSeenAt: d.lastSeenAt,
      }));

    return successResponse({ devices: publicDevices }, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    // Error logged by Lambda runtime
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
