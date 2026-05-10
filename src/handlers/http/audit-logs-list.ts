/**
 * GET /v1/audit-logs
 *
 * Returns paginated audit logs for the authenticated user (user-scoped).
 * Users can only see their own audit logs.
 *
 * Query parameters:
 *   category — filter by audit category (optional)
 *   from — ISO date start range (default: 30 days ago)
 *   to — ISO date end range (default: now)
 *   limit — results per page, 1–200 (default: 50)
 *   cursor — pagination cursor from previous response
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { requireTrustedDeviceAuth } from "./http-auth-context.js";
import { queryUserAuditLogs } from "../../audit/audit-repository.js";
import {
  successResponse,
  errorResponse,
  rawErrorResponse,
} from "../../app/http-response.js";
import { AppError } from "../../app/errors.js";
import type { AuditCategory } from "../../audit/audit-model.js";

const VALID_CATEGORIES: AuditCategory[] = [
  "KEY_PROVISIONING",
  "LOGIN",
  "AUTHENTICATION",
  "RESOURCE_ACCESS",
];

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = await requireTrustedDeviceAuth(event);

    const params = event.queryStringParameters ?? {};

    // Validate category if provided
    const category = params.category as AuditCategory | undefined;
    if (category && !VALID_CATEGORIES.includes(category)) {
      return rawErrorResponse(
        400,
        "VALIDATION_ERROR",
        `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
        event.requestContext?.requestId,
      );
    }

    const limit = params.limit ? parseInt(params.limit, 10) : 50;
    if (isNaN(limit) || limit < 1 || limit > 200) {
      return rawErrorResponse(
        400,
        "VALIDATION_ERROR",
        "Limit must be between 1 and 200",
        event.requestContext?.requestId,
      );
    }

    const result = await queryUserAuditLogs(auth.user.sub, {
      category,
      from: params.from,
      to: params.to,
      limit,
      cursor: params.cursor,
    });

    return successResponse(result, 200, event.requestContext?.requestId);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error, event.requestContext?.requestId);
    }
    console.error("Unhandled error in audit-logs-list:", error);
    return rawErrorResponse(
      500,
      "INTERNAL_ERROR",
      "Internal server error",
      event.requestContext?.requestId,
    );
  }
};
