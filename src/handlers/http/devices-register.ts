import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { requireAuth } from '../../auth/auth-guard.js';
import * as DeviceService from '../../devices/device-service.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';

const registerSchema = z.object({
  deviceId: z.string().min(1),
  deviceLabel: z.string().optional(),
  platform: z.string().optional(),
  appVersion: z.string().optional()
});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await requireAuth(event.headers.Authorization || event.headers.authorization);

    if (!event.body) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing request body');
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(event.body);
    } catch {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Invalid JSON body');
    }

    const validationResult = registerSchema.safeParse(parsedBody);
    if (!validationResult.success) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Invalid input parameters');
    }

    const device = await DeviceService.registerDevice({
      userId: user.sub,
      deviceId: validationResult.data.deviceId,
      deviceLabel: validationResult.data.deviceId,
      platform: validationResult.data.platform,
      appVersion: validationResult.data.appVersion
    });

    return successResponse(device, 201);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    console.error('Unhandled error in devices-register:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
