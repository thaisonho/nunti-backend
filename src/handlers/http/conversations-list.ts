import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireTrustedDeviceAuth } from './http-auth-context.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';
import { listConversations } from '../../messages/message-repository.js';
import { getUserById } from '../../users/user-service.js';

function displayNameFromEmail(email: string): string {
  return email.split('@')[0] || email;
}

async function hydrateConversationProfiles(
  conversations: Awaited<ReturnType<typeof listConversations>>,
) {
  return Promise.all(conversations.map(async (conversation) => {
    const profile = await getUserById(conversation.userId).catch((error) => {
      console.warn('Failed to hydrate conversation profile', {
        userId: conversation.userId,
        error: (error as Error).message,
      });
      return null;
    });

    if (!profile?.email) {
      return conversation;
    }

    return {
      ...conversation,
      userEmail: profile.email,
      userDisplayName: displayNameFromEmail(profile.email),
    };
  }));
}

/**
 * List all conversations for the authenticated user.
 * Returns a list of conversations sorted by most recent message.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext?.requestId;

  try {
    const { user, deviceId } = await requireTrustedDeviceAuth(event);

    const conversations = await hydrateConversationProfiles(
      await listConversations(user.sub, deviceId),
    );

    return successResponse({
      conversations,
      count: conversations.length,
    }, 200, requestId);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error, requestId);
    }
    console.error('Unhandled error in conversations-list:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error', requestId);
  }
};
