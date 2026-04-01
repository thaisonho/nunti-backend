/**
 * WebSocket $disconnect handler.
 *
 * Removes the connection from the registry on clean or unclean disconnect.
 * Uses requestContext.authorizer to recover userId if available, otherwise
 * logs a warning (connection cleanup will happen via GoneException on next delivery attempt).
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { removeConnection } from '../../realtime/connection-registry.js';

interface WebSocketDisconnectEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
    authorizer?: Record<string, unknown>;
  };
}

export const handler = async (event: WebSocketDisconnectEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId;

  try {
    // Attempt to extract userId from authorizer context
    const userId = event.requestContext.authorizer?.userId as string | undefined;

    if (userId) {
      await removeConnection(userId, connectionId);
    } else {
      // Without userId, we cannot directly query the connection.
      // Stale entries are cleaned up via GoneException in publishers.
      console.warn('WebSocket disconnect without userId context', { connectionId });
    }

    return { statusCode: 200, body: 'Disconnected' };
  } catch (error) {
    console.error('WebSocket disconnect error', {
      connectionId,
      error: (error as Error).message,
    });
    // Always return 200 on disconnect — nothing to reject
    return { statusCode: 200, body: 'Disconnected' };
  }
};
