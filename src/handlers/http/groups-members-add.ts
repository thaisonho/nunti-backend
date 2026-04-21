import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';
import * as GroupService from '../../groups/group-service.js';
import { requireTrustedDeviceAuth } from './http-auth-context.js';

const addMemberSchema = z.object({
  userId: z.string().min(1),
});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const auth = await requireTrustedDeviceAuth(event);

    const groupId = event.pathParameters?.groupId;
    if (!groupId) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing groupId in path parameter');
    }

    if (!event.body) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing request body');
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(event.body);
    } catch {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Invalid JSON body');
    }

    const validationResult = addMemberSchema.safeParse(parsedBody);
    if (!validationResult.success) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Invalid input parameters');
    }

    const result = await GroupService.addGroupMember(
      auth.user.sub,
      auth.deviceId,
      groupId,
      validationResult.data.userId,
    );

    return successResponse(result, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    console.error('Unhandled error in groups-members-add:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
