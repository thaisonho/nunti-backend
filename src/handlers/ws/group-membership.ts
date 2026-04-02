import type { APIGatewayProxyResult } from 'aws-lambda';
import type { WebSocketConnectionContext } from '../../auth/websocket-auth.js';
import type { WebSocketErrorEvent } from '../../messages/message-model.js';
import { validateGroupMembershipCommandRequest } from '../../messages/group-message-model.js';
import * as GroupMessageService from '../../messages/group-message-service.js';

interface WebSocketGroupMembershipEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
    authorizer?: Record<string, unknown>;
  };
  body?: string | null;
}

function buildConnectionContext(event: WebSocketGroupMembershipEvent): WebSocketConnectionContext {
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

export const handler = async (event: WebSocketGroupMembershipEvent): Promise<APIGatewayProxyResult> => {
  const requestId = extractRequestId(event.body);

  try {
    const context = buildConnectionContext(event);

    if (!event.body) {
      return errorResult('VALIDATION_ERROR', 'Invalid membership command', requestId);
    }

    const payload = JSON.parse(event.body);
    const request = validateGroupMembershipCommandRequest(payload);

    const result = await GroupMessageService.processMembershipChange(context, request);

    return {
      statusCode: 200,
      body: JSON.stringify({
        eventType: 'membership-change-result',
        requestId: result.requestId,
        eventId: result.eventId,
        status: result.status,
        serverTimestamp: result.serverTimestamp,
      }),
    };
  } catch (error) {
    const isValidationFailure =
      (error as Error).name === 'SyntaxError' ||
      (error as { name?: string }).name === 'ZodError';

    if (isValidationFailure) {
      return errorResult('VALIDATION_ERROR', 'Invalid membership command', requestId);
    }

    return errorResult('INTERNAL_ERROR', 'Membership command failed', requestId);
  }
};

function errorResult(code: string, message: string, requestId?: string): APIGatewayProxyResult {
  const errorEvent: WebSocketErrorEvent = {
    eventType: 'error',
    code,
    message,
    requestId,
  };

  return {
    statusCode: 200,
    body: JSON.stringify(errorEvent),
  };
}

function extractRequestId(body?: string | null): string | undefined {
  if (!body) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return typeof parsed.requestId === 'string' && parsed.requestId.length > 0
      ? parsed.requestId
      : undefined;
  } catch {
    return undefined;
  }
}
