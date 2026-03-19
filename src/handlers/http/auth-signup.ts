/**
 * POST /v1/auth/signup
 *
 * Accepts email/password and creates a new Cognito user.
 * Returns user sub and confirmation status.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { z } from "zod/v4";
import { signUp } from "../../auth/cognito-service.js";
import { successResponse, errorResponse, rawErrorResponse } from "../../app/http-response.js";
import { AppError } from "../../app/errors.js";

const SignUpSchema = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body ?? "{}");
    const parsed = SignUpSchema.safeParse(body);

    if (!parsed.success) {
      return rawErrorResponse(
        400,
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join("; "),
        event.requestContext?.requestId,
      );
    }

    const result = await signUp(parsed.data);

    return successResponse(
      {
        userSub: result.userSub,
        userConfirmed: result.userConfirmed,
      },
      201,
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
