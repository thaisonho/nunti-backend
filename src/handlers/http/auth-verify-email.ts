/**
 * POST /v1/auth/verify-email
 *
 * Verifies user email using Cognito 6-digit confirmation code.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { z } from "zod/v4";
import { verifyEmail } from "../../auth/cognito-service.js";
import { successResponse, errorResponse, rawErrorResponse } from "../../app/http-response.js";
import { AppError } from "../../app/errors.js";

const VerifyEmailSchema = z.object({
  email: z.email("Invalid email format"),
  code: z.string().regex(/^\d{6}$/, "Verification code must be 6 digits"),
});

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body ?? "{}");
    const parsed = VerifyEmailSchema.safeParse(body);

    if (!parsed.success) {
      return rawErrorResponse(
        400,
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join("; "),
        event.requestContext?.requestId,
      );
    }

    const result = await verifyEmail(parsed.data);

    return successResponse(
      {
        message: "Email verified successfully",
        verified: result.verified,
      },
      200,
      event.requestContext?.requestId,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error, event.requestContext?.requestId);
    }
    return rawErrorResponse(
      500,
      "INTERNAL_ERROR",
      "An unexpected error occurred",
      event.requestContext?.requestId,
    );
  }
}
