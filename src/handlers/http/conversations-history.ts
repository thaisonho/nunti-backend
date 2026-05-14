/**
 * GET /conversations/history
 *
 * Returns paginated encrypted message history for the authenticated device and
 * one target user. Conversations are implicit and identified by the other user.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireTrustedDeviceAuth } from './http-auth-context.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';
import { listConversationMessages } from '../../messages/message-repository.js';

const VALID_ORDERS = ['asc', 'desc'] as const;
type HistoryOrder = typeof VALID_ORDERS[number];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext?.requestId;

  try {
    const { user, deviceId } = await requireTrustedDeviceAuth(event);
    const params = event.queryStringParameters ?? {};
    const targetUserId = params.userId?.trim();

    if (!targetUserId) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing userId query parameter', requestId);
    }

    const order = params.order ?? 'desc';
    if (!isHistoryOrder(order)) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Invalid order. Must be "asc" or "desc"', requestId);
    }

    const limit = params.limit ? Number.parseInt(params.limit, 10) : 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Limit must be between 1 and 200', requestId);
    }

    const result = await listConversationMessages(user.sub, deviceId, targetUserId, {
      limit,
      cursor: params.cursor,
      order,
    });

    return successResponse({
      ...result,
      count: result.messages.length,
    }, 200, requestId);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error, requestId);
    }

    console.error('Unhandled error in conversations-history:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error', requestId);
  }
};

function isHistoryOrder(value: string): value is HistoryOrder {
  return (VALID_ORDERS as readonly string[]).includes(value);
}
