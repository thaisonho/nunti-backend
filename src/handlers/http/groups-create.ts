import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';
import * as GroupService from '../../groups/group-service.js';
import { requireTrustedDeviceAuth } from './http-auth-context.js';

const createGroupSchema = z.object({
  groupId: z.string().min(1).optional(),
  groupName: z.string().min(1).max(120).optional(),
  memberUserIds: z.array(z.string().min(1)).max(200).optional(),
});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const auth = await requireTrustedDeviceAuth(event);

    let parsedBody: unknown = {};
    if (event.body) {
      try {
        parsedBody = JSON.parse(event.body);
      } catch {
        return rawErrorResponse(400, 'VALIDATION_ERROR', 'Invalid JSON body');
      }
    }

    const validationResult = createGroupSchema.safeParse(parsedBody);
    if (!validationResult.success) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Invalid input parameters');
    }

    const created = await GroupService.createGroup({
      actorUserId: auth.user.sub,
      actorDeviceId: auth.deviceId,
      groupId: validationResult.data.groupId,
      groupName: validationResult.data.groupName,
      memberUserIds: validationResult.data.memberUserIds,
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    console.error('Unhandled error in groups-create:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
