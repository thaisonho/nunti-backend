import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { requireAuth } from '../../auth/auth-guard.js';
import * as DeviceService from '../../devices/device-service.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';

const keyPayloadSchema = z.object({
  keyId: z.string().min(1),
  algorithm: z.string().min(1),
  publicKey: z.string().min(1),
});

const signedPreKeySchema = keyPayloadSchema.extend({
  signature: z.string().min(1),
});

const uploadSchema = z.object({
  identityKey: keyPayloadSchema,
  signedPreKey: signedPreKeySchema,
  oneTimePreKeys: z.array(keyPayloadSchema).optional(),
});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await requireAuth(event.headers.Authorization || event.headers.authorization);

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

    const validationResult = uploadSchema.safeParse(parsedBody);
    if (!validationResult.success) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Invalid input parameters');
    }

    const updated = await DeviceService.uploadDeviceKeys({
      actorUserId: user.sub,
      actorDeviceId,
      targetDeviceId,
      identityKey: validationResult.data.identityKey,
      signedPreKey: validationResult.data.signedPreKey,
      oneTimePreKeys: validationResult.data.oneTimePreKeys,
    });

    return successResponse(updated, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    console.error('Unhandled error in devices-keys:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
