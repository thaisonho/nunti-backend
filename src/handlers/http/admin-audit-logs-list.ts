/**
 * GET /v1/admin/audit-logs
 *
 * Returns paginated audit logs across all users for Cognito admins only.
 * Supports optional filtering by userId, category, and date range.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { requireAdmin } from "../../auth/admin-guard.js";
import { queryAllAuditLogs } from "../../audit/audit-repository.js";
import * as AuditService from "../../audit/audit-service.js";
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
    const admin = await requireAdmin(
      event.headers.Authorization || event.headers.authorization,
    );
    const params = event.queryStringParameters ?? {};

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

    const result = await queryAllAuditLogs({
      userId: params.userId?.trim() || undefined,
      category,
      from: params.from,
      to: params.to,
      limit,
      cursor: params.cursor,
    });

    AuditService.adminAuditLogViewed(
      admin.sub,
      params.userId?.trim() || undefined,
      event.requestContext?.identity?.sourceIp,
    );

    return successResponse(result, 200, event.requestContext?.requestId);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error, event.requestContext?.requestId);
    }
    console.error("Unhandled error in admin-audit-logs-list:", error);
    return rawErrorResponse(
      500,
      "INTERNAL_ERROR",
      "Internal server error",
      event.requestContext?.requestId,
    );
  }
};
