import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';
import * as GroupService from '../../groups/group-service.js';
import { requireTrustedDeviceAuth } from './http-auth-context.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const auth = await requireTrustedDeviceAuth(event);

    const groupId = event.pathParameters?.groupId;
    if (!groupId) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing groupId in path parameter');
    }

    const group = await GroupService.getGroupDetails(auth.user.sub, groupId);
    return successResponse(group, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    console.error('Unhandled error in groups-get:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
