/**
 * WebSocket reconnect route handler.
 *
 * Triggered by the client after authentication to initiate
 * the backlog drain phase. Executes the replay orchestration
 * and emits the replay-complete event exactly once.
 *
 * Drain order: direct-message backlog, then membership backlog, then group message backlog.
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import type { WebSocketConnectionContext } from '../../auth/websocket-auth.js';
import * as MessageService from '../../messages/message-service.js';
import * as GroupMessageService from '../../messages/group-message-service.js';
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

    // Drain direct-message backlog first.
    await MessageService.replayBacklog(context);

    // Then drain membership backlog and emit a membership replay boundary.
    await GroupMessageService.replayMembershipBacklog(context);

    // Then drain group message backlog and emit a group message replay boundary.
    await GroupMessageService.replayGroupMessageBacklog(context);

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
