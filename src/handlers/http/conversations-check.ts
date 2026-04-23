import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireTrustedDeviceAuth } from './http-auth-context.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';
import { checkConversationExists } from '../../messages/message-repository.js';

/**
 * Check if a conversation already exists between current user and target user.
 * This is a placeholder - you'll need to implement the actual conversation lookup logic
 * based on your messages/conversations data model.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { user, deviceId } = await requireTrustedDeviceAuth(event);

    const targetUserId = event.queryStringParameters?.userId;

    if (!targetUserId || targetUserId.trim().length === 0) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing userId query parameter');
    }

    // Check if any messages exist between current user and target user
    const exists = await checkConversationExists(user.sub, deviceId, targetUserId);

    return successResponse({
      exists,
      conversationId: null, // We don't have explicit conversation IDs in this architecture
    }, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    console.error('Unhandled error in conversations-check:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
