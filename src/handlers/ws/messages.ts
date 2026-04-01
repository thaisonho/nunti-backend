/**
 * WebSocket sendMessage route handler.
 *
 * Receives a direct-message relay request from an authenticated sender,
 * validates the payload, and delegates to the message service for
 * persistence and live delivery.
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import type { WebSocketConnectionContext } from '../../auth/websocket-auth.js';
import { validateDirectMessageRequest, type WebSocketErrorEvent } from '../../messages/message-model.js';
import * as MessageService from '../../messages/message-service.js';

interface WebSocketMessageEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
    authorizer?: Record<string, unknown>;
  };
  body?: string | null;
}

/**
 * Build the connection context from the request context.
 * Assumes the connect handler stored userId and deviceId in the authorizer context.
 */
function buildConnectionContext(event: WebSocketMessageEvent): WebSocketConnectionContext {
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

export const handler = async (event: WebSocketMessageEvent): Promise<APIGatewayProxyResult> => {
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

    let request;
    try {
      request = validateDirectMessageRequest(parsedBody);
    } catch (error) {
      return errorResult('VALIDATION_ERROR', (error as Error).message);
    }

    const result = await MessageService.sendMessage(context, request);

    return {
      statusCode: 200,
      body: JSON.stringify({
        eventType: 'send-result',
        messageId: result.messageId,
        status: result.status,
        serverTimestamp: result.serverTimestamp,
      }),
    };
  } catch (error) {
    console.error('WebSocket sendMessage error', {
      connectionId: event.requestContext.connectionId,
      error: (error as Error).message,
    });
    return errorResult('INTERNAL_ERROR', 'Message send failed');
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
