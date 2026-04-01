/**
 * WebSocket reconnect route handler.
 *
 * Triggered by the client after authentication to initiate
 * the backlog drain phase. Executes the replay orchestration
 * and emits the replay-complete event exactly once.
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import type { WebSocketConnectionContext } from '../../auth/websocket-auth.js';
import * as MessageService from '../../messages/message-service.js';
import type { WebSocketErrorEvent } from '../../messages/message-model.js';

interface WebSocketReconnectEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
    authorizer?: Record<string, unknown>;
  };
}

function buildConnectionContext(event: WebSocketReconnectEvent): WebSocketConnectionContext {
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

export const handler = async (event: WebSocketReconnectEvent): Promise<APIGatewayProxyResult> => {
  try {
    const context = buildConnectionContext(event);

    // Block awaiting the backlog drain. The service will emit relay events
    // followed by a terminal replay-complete event over the active connection.
    await MessageService.replayBacklog(context);

    return { statusCode: 200, body: 'Replay requested' };
  } catch (error) {
    console.error('WebSocket reconnect error', {
      connectionId: event.requestContext.connectionId,
      error: (error as Error).message,
    });

    const errorEvent: WebSocketErrorEvent = {
      eventType: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Replay request failed',
    };

    return {
      statusCode: 200, 
      body: JSON.stringify(errorEvent),
    };
  }
};
