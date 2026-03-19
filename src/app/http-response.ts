/**
 * Standardized HTTP response envelope for all API endpoints.
 *
 * Success shape:
 *   { data: T, requestId: string }
 *
 * Error shape:
 *   { error: { code: string, message: string, requestId: string } }
 */

import { randomUUID } from "crypto";
import type { AppError } from "./errors.js";

export interface SuccessResponse<T = unknown> {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

const DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

/**
 * Build a success HTTP response.
 */
export function successResponse<T>(
  data: T,
  statusCode: number = 200,
  requestId?: string,
): SuccessResponse<T> {
  return {
    statusCode,
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({
      data,
      requestId: requestId ?? randomUUID(),
    }),
  };
}

/**
 * Build an error HTTP response from an AppError.
 */
export function errorResponse(
  error: AppError,
  requestId?: string,
): SuccessResponse<never> {
  const body: ErrorResponseBody = {
    error: {
      code: error.code,
      message: error.message,
      requestId: requestId ?? randomUUID(),
    },
  };

  return {
    statusCode: error.statusCode,
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * Build an error HTTP response from raw values.
 */
export function rawErrorResponse(
  statusCode: number,
  code: string,
  message: string,
  requestId?: string,
): SuccessResponse<never> {
  const body: ErrorResponseBody = {
    error: {
      code,
      message,
      requestId: requestId ?? randomUUID(),
    },
  };

  return {
    statusCode,
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(body),
  };
}
