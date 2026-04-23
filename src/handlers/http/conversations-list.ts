import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireTrustedDeviceAuth } from './http-auth-context.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';
import { listConversations } from '../../messages/message-repository.js';

/**
 * List all conversations for the authenticated user.
 * Returns a list of conversations sorted by most recent message.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { user, deviceId } = await requireTrustedDeviceAuth(event);

    const conversations = await listConversations(user.sub, deviceId);

    return successResponse({
      conversations,
      count: conversations.length,
    }, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    console.error('Unhandled error in conversations-list:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
