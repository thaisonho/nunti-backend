/**
 * POST /v1/auth/resend-verification
 *
 * Resends email verification code with cooldown-aware messaging.
 * Does not leak account existence — returns generic response for all outcomes.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { z } from "zod/v4";
import { resendVerification } from "../../auth/cognito-service.js";
import { successResponse, errorResponse, rawErrorResponse } from "../../app/http-response.js";
import { AppError } from "../../app/errors.js";

const ResendSchema = z.object({
  email: z.email("Invalid email format"),
});

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body ?? "{}");
    const parsed = ResendSchema.safeParse(body);

    if (!parsed.success) {
      return rawErrorResponse(
        400,
        "VALIDATION_ERROR",
        "Invalid email format",
        event.requestContext?.requestId,
      );
    }

    const result = await resendVerification(parsed.data);

    return successResponse(
      {
        message: "If an account exists, a verification code has been sent",
        deliveryMedium: result.deliveryMedium,
        destination: result.destination,
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
