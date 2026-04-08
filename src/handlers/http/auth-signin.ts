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

const SignInSchema = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body ?? "{}");
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
