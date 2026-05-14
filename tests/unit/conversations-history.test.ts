import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

vi.mock('../../src/handlers/http/http-auth-context.js');
vi.mock('../../src/messages/message-repository.js');

import { handler } from '../../src/handlers/http/conversations-history.js';
import { requireTrustedDeviceAuth } from '../../src/handlers/http/http-auth-context.js';
import { listConversationMessages } from '../../src/messages/message-repository.js';

function createEvent(queryStringParameters: Record<string, string> | null): APIGatewayProxyEvent {
  return {
    headers: { Authorization: 'Bearer token', 'X-Device-Id': 'device-1' },
    body: null,
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/conversations/history',
    pathParameters: null,
    queryStringParameters,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: { requestId: 'history-req-1' } as any,
    resource: '',
  };
}

describe('GET /conversations/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTrustedDeviceAuth).mockResolvedValue({
      user: { sub: 'user-1', tokenUse: 'access' },
      deviceId: 'device-1',
    });
    vi.mocked(listConversationMessages).mockResolvedValue({
      messages: [],
      nextCursor: null,
    });
  });

  it('fetches history for the authenticated user and trusted device', async () => {
    vi.mocked(listConversationMessages).mockResolvedValue({
      messages: [{
        messageId: 'msg-1',
        senderUserId: 'user-1',
        senderDeviceId: 'device-1',
        recipientUserId: 'user-2',
        recipientDeviceId: 'device-2',
        ciphertext: 'sender-copy',
        deliveryState: 'delivered',
        serverTimestamp: '2026-04-01T10:00:00.000Z',
        direction: 'outbound',
      }],
      nextCursor: 'cursor-1',
    });

    const response = await handler(createEvent({ userId: 'user-2', limit: '25', order: 'asc' }));

    expect(response.statusCode).toBe(200);
    expect(listConversationMessages).toHaveBeenCalledWith('user-1', 'device-1', 'user-2', {
      limit: 25,
      cursor: undefined,
      order: 'asc',
    });

    const body = JSON.parse(response.body);
    expect(body.requestId).toBe('history-req-1');
    expect(body.data.count).toBe(1);
    expect(body.data.messages[0].direction).toBe('outbound');
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('rejects missing userId', async () => {
    const response = await handler(createEvent(null));

    expect(response.statusCode).toBe(400);
    expect(listConversationMessages).not.toHaveBeenCalled();
    expect(JSON.parse(response.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid order', async () => {
    const response = await handler(createEvent({ userId: 'user-2', order: 'newest' }));

    expect(response.statusCode).toBe(400);
    expect(listConversationMessages).not.toHaveBeenCalled();
  });
});
