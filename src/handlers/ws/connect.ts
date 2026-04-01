/**
 * WebSocket $connect handler.
 *
 * Authenticates the connecting device, extracts user + device identity,
 * and registers the connection in the device-aware connection registry.
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { extractWebSocketContext } from '../../auth/websocket-auth.js';
import { putConnection } from '../../realtime/connection-registry.js';
import { AppError } from '../../app/errors.js';

interface WebSocketConnectEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
  };
  queryStringParameters?: Record<string, string> | null;
  headers?: Record<string, string> | null;
}

export const handler = async (event: WebSocketConnectEvent): Promise<APIGatewayProxyResult> => {
  try {
    const context = await extractWebSocketContext(event);

    await putConnection(context.userId, context.deviceId, context.connectionId);

    return { statusCode: 200, body: 'Connected' };
  } catch (error) {
    if (error instanceof AppError) {
      console.warn('WebSocket connect auth failed', {
        connectionId: event.requestContext.connectionId,
        code: error.code,
      });
      return { statusCode: 401, body: 'Unauthorized' };
    }

    console.error('WebSocket connect error', {
      connectionId: event.requestContext.connectionId,
      error: (error as Error).message,
    });
    return { statusCode: 401, body: 'Unauthorized' };
  }
};
