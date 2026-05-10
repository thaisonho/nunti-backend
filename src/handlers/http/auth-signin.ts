/**
 * POST /v1/auth/signin
 *
 * Accepts email/password and authenticates via Cognito.
 * Returns access, ID, and refresh tokens on success.
 * Generic failure messaging reduces account enumeration risk.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { z } from "zod/v4";
import { signIn } from "../../auth/cognito-service.js";
import { successResponse, errorResponse, rawErrorResponse } from "../../app/http-response.js";
import { AppError } from "../../app/errors.js";
import * as AuditService from "../../audit/audit-service.js";

const SignInSchema = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  let auditEmail = "unknown";

  try {
    const body = JSON.parse(event.body ?? "{}");
    auditEmail =
      typeof body.email === "string" && body.email.trim().length > 0
        ? body.email.trim()
        : auditEmail;
    const parsed = SignInSchema.safeParse(body);

    if (!parsed.success) {
      return rawErrorResponse(
        400,
        "VALIDATION_ERROR",
        "Invalid credentials format",
        event.requestContext?.requestId,
      );
    }

    const result = await signIn(parsed.data);

    // Decode sub from access token for audit (JWT payload is base64)
    let userId = 'unknown';
    try {
      const payload = JSON.parse(Buffer.from(result.accessToken.split('.')[1], 'base64').toString());
      userId = payload.sub ?? 'unknown';
    } catch { /* best-effort */ }

    AuditService.signinSuccess(
      userId,
      undefined,
      event.requestContext?.identity?.sourceIp,
      event.headers?.['User-Agent'] ?? event.headers?.['user-agent'],
    );

    return successResponse(
      {
        accessToken: result.accessToken,
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      },
      200,
      event.requestContext?.requestId,
    );
  } catch (error) {
    AuditService.signinFailure(
      auditEmail,
      error instanceof AppError ? error.code : 'UNKNOWN',
      event.requestContext?.identity?.sourceIp,
      event.headers?.['User-Agent'] ?? event.headers?.['user-agent'],
    );

    if (error instanceof AppError) {
      return errorResponse(error, event.requestContext?.requestId);
    }
    // Generic message for all unknown signin errors
    return rawErrorResponse(
      401,
      "AUTH_SIGNIN_FAILED",
      "Authentication failed",
      event.requestContext?.requestId,
    );
  }
}
