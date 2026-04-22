/**
 * Domain and application error types with machine-readable error codes.
 *
 * Error taxonomy:
 * - AUTH_TOKEN_MISSING_OR_MALFORMED → 401
 * - AUTH_TOKEN_EXPIRED → 401
 * - AUTH_TOKEN_INVALID_CLAIMS → 401
 * - AUTH_FORBIDDEN → 403
 * - VALIDATION_ERROR → 400
 * - RESOURCE_NOT_FOUND → 404
 * - CONFLICT → 409
 * - INTERNAL_ERROR → 500
 */

export type AuthErrorCode =
  | "AUTH_TOKEN_MISSING_OR_MALFORMED"
  | "AUTH_TOKEN_EXPIRED"
  | "AUTH_TOKEN_INVALID_CLAIMS"
  | "AUTH_FORBIDDEN";

export type AppErrorCode =
  | AuthErrorCode
  | "VALIDATION_ERROR"
  | "RESOURCE_NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "AUTH_SIGNUP_FAILED"
  | "AUTH_SIGNIN_FAILED"
  | "AUTH_RESEND_FAILED"
  | "AUTH_USER_EXISTS"
  | "AUTH_INVALID_PASSWORD"
  | "AUTH_USER_NOT_CONFIRMED"
  | "AUTH_USER_ALREADY_CONFIRMED"
  | "AUTH_VERIFICATION_CODE_INVALID"
  | "AUTH_VERIFICATION_CODE_EXPIRED"
  | "AUTH_VERIFY_FAILED"
  | "AUTH_CODE_DELIVERY_FAILED"
  | "AUTH_LIMIT_EXCEEDED"
  | "DEVICE_ALREADY_REGISTERED"
  | "DEVICE_NOT_FOUND"
  | "DEVICE_ALREADY_REVOKED";

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly statusCode: number;

  constructor(code: AppErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class AuthError extends AppError {
  constructor(code: AuthErrorCode, statusCode: 401 | 403) {
    // Generic human-facing message — details in logs only
    super(code, "Authentication failed", statusCode);
    this.name = "AuthError";
  }
}
