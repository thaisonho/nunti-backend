/**
 * GET /v1/conversations/history
 *
 * Returns paginated message history for a conversation between the
 * authenticated user and a target user.
 *
 * Query parameters:
 *   userId — target user id (required)
 *   limit — results per page, 1–200 (default: 50)
 *   cursor — pagination cursor from previous response
 *   order — asc | desc (default: desc)
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireTrustedDeviceAuth } from './http-auth-context.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';
import { listConversationMessages, type ConversationMessageOrder } from '../../messages/message-repository.js';

const VALID_ORDERS: ConversationMessageOrder[] = ['asc', 'desc'];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const auth = await requireTrustedDeviceAuth(event);
    const params = event.queryStringParameters ?? {};

    const targetUserId = params.userId?.trim();
    if (!targetUserId) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing userId query parameter');
    }

    const order = params.order as ConversationMessageOrder | undefined;
    if (order && !VALID_ORDERS.includes(order)) {
      return rawErrorResponse(
        400,
        'VALIDATION_ERROR',
        'Invalid order. Must be "asc" or "desc"',
      );
    }

    const limit = params.limit ? parseInt(params.limit, 10) : 50;
    if (isNaN(limit) || limit < 1 || limit > 200) {
      return rawErrorResponse(
        400,
        'VALIDATION_ERROR',
        'Limit must be between 1 and 200',
      );
    }

    const result = await listConversationMessages(auth.user.sub, targetUserId, {
      limit,
      cursor: params.cursor,
      order,
    });

    return successResponse({
      ...result,
      count: result.messages.length,
    }, 200, event.requestContext?.requestId);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error, event.requestContext?.requestId);
    }
    console.error('Unhandled error in conversations-history:', error);
    return rawErrorResponse(
      500,
      'INTERNAL_ERROR',
      'Internal server error',
      event.requestContext?.requestId,
    );
  }
};
