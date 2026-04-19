import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse } from '../../app/http-response.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> =>
  successResponse(
    {
      status: 'ok',
      service: 'nunti-backend',
      stage: process.env.STAGE ?? 'unknown',
      timestamp: new Date().toISOString(),
    },
    200,
    event.requestContext?.requestId,
  );
