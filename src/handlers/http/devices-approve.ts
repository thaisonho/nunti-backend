import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { requireHttpAuthContext } from './http-auth-context.js';
import * as DeviceService from '../../devices/device-service.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';

const approveSchema = z.object({
  signatureByPrimary: z.string().min(1),
});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await requireHttpAuthContext(event);

    const actorDeviceId = event.headers['X-Device-Id'] || event.headers['x-device-id'];
    if (!actorDeviceId) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing X-Device-Id header');
    }

    const targetDeviceId = event.pathParameters?.deviceId;
    if (!targetDeviceId) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing deviceId in path parameter');
    }

    if (!event.body) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing request body');
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(event.body);
    } catch {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Invalid JSON body');
    }

    const validationResult = approveSchema.safeParse(parsedBody);
    if (!validationResult.success) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Invalid input parameters');
    }

    const updated = await DeviceService.approveDevice({
      actorUserId: user.sub,
      actorDeviceId,
      targetDeviceId,
      signatureByPrimary: validationResult.data.signatureByPrimary,
    });

    return successResponse(updated, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    console.error('Unhandled error in devices-approve:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
