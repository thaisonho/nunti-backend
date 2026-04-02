/**
 * WebSocket group send route handler.
 *
 * Receives a group message send request from an authenticated sender,
 * validates the payload, and delegates to the group message service for
 * deterministic fanout and per-device delivery.
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import type { WebSocketConnectionContext } from '../../auth/websocket-auth.js';
import { validateGroupSendRequest, type GroupSendRequest } from '../../messages/group-message-model.js';
import type { WebSocketErrorEvent } from '../../messages/message-model.js';
import * as GroupMessageService from '../../messages/group-message-service.js';

interface WebSocketGroupSendEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
    authorizer?: Record<string, unknown>;
  };
  body?: string | null;
}

/**
 * Build the connection context from the request context.
 */
function buildConnectionContext(event: WebSocketGroupSendEvent): WebSocketConnectionContext {
  const auth = event.requestContext.authorizer ?? {};
  const userId = auth.userId as string | undefined;
  const deviceId = auth.deviceId as string | undefined;

  if (!userId || !deviceId) {
    throw new Error('Missing connection identity context');
  }

  return {
    userId,
    deviceId,
    connectionId: event.requestContext.connectionId,
  };
}

export const handler = async (event: WebSocketGroupSendEvent): Promise<APIGatewayProxyResult> => {
  try {
    const context = buildConnectionContext(event);

    if (!event.body) {
      return errorResult('VALIDATION_ERROR', 'Missing message body');
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(event.body);
    } catch {
      return errorResult('VALIDATION_ERROR', 'Invalid JSON body');
    }

    let request: GroupSendRequest;
    try {
      request = validateGroupSendRequest(parsedBody);
    } catch (error) {
      return errorResult('VALIDATION_ERROR', (error as Error).message);
    }

    const result = await GroupMessageService.sendGroupMessage(context, request);

    return {
      statusCode: 200,
      body: JSON.stringify({
        eventType: 'group-send-result',
        groupMessageId: result.groupMessageId,
        status: result.status,
        recipientUserCount: result.recipientUserCount,
        targetDeviceCount: result.targetDeviceCount,
        serverTimestamp: result.serverTimestamp,
      }),
    };
  } catch (error) {
    console.error('WebSocket groupSend error', {
      connectionId: event.requestContext.connectionId,
      error: (error as Error).message,
    });
    return errorResult('INTERNAL_ERROR', 'Group message send failed');
  }
};

function errorResult(code: string, message: string): APIGatewayProxyResult {
  const errorEvent: WebSocketErrorEvent = {
    eventType: 'error',
    code,
    message,
  };
  return {
    statusCode: 200, // WebSocket routes always return 200; error is in the payload
    body: JSON.stringify(errorEvent),
  };
}
