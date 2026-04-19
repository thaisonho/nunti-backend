import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler as healthHandler } from '../../src/handlers/http/health.js';

function createEvent(): APIGatewayProxyEvent {
  return {
    headers: {},
    body: null,
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/health',
    pathParameters: null,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: { requestId: 'health-req-1' } as any,
    resource: '',
  };
}

describe('GET /health', () => {
  it('returns status ok', async () => {
    const response = await healthHandler(createEvent());

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body);
    expect(parsed.data.status).toBe('ok');
    expect(parsed.data.service).toBe('nunti-backend');
    expect(parsed.data.timestamp).toBeDefined();
    expect(parsed.requestId).toBe('health-req-1');
  });
});
