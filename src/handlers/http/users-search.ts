import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireHttpAuthContext } from './http-auth-context.js';
import * as UserService from '../../users/user-service.js';
import { successResponse, errorResponse, rawErrorResponse } from '../../app/http-response.js';
import { AppError } from '../../app/errors.js';
import * as AuditService from '../../audit/audit-service.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await requireHttpAuthContext(event);

    const email = event.queryStringParameters?.email;

    if (!email || email.trim().length === 0) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Missing or empty email query parameter');
    }

    // Require minimum 3 characters to prevent scraping
    if (email.trim().length < 3) {
      return rawErrorResponse(400, 'VALIDATION_ERROR', 'Email query must be at least 3 characters');
    }

    const results = await UserService.searchUsersByEmail({
      email: email.trim(),
      currentUserId: user.sub,
    });

    AuditService.userSearched(
      user.sub,
      email.trim(),
      results.length,
      event.requestContext?.identity?.sourceIp,
    );

    return successResponse({
      users: results,
      count: results.length,
    }, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error);
    }
    console.error('Unhandled error in users-search:', error);
    return rawErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
