/**
 * Auth error mapper — maps JWT verification and auth errors to locked machine codes.
 *
 * Error mapping contract (locked):
 * - Missing/malformed Authorization header → 401 AUTH_TOKEN_MISSING_OR_MALFORMED
 * - Expired token → 401 AUTH_TOKEN_EXPIRED
 * - Invalid issuer/audience/token_use/signature → 401 AUTH_TOKEN_INVALID_CLAIMS
 * - Valid token but insufficient permission → 403 AUTH_FORBIDDEN
 *
 * Human-facing messages are always generic ("Authentication failed") to prevent enumeration.
 */

import { AuthError } from "../app/errors.js";
import type { AuthErrorCode } from "../app/errors.js";

/**
 * Determine if an error from aws-jwt-verify indicates token expiration.
 */
export function isExpiredTokenError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("expired") ||
      message.includes("token expired") ||
      message.includes("exp")
    );
  }
  return false;
}

/**
 * Map a JWT verification error to the appropriate AuthError.
 * Only called for errors thrown by the verifier (not missing/malformed headers).
 */
export function mapVerifierError(error: unknown): AuthError {
  if (isExpiredTokenError(error)) {
    return new AuthError("AUTH_TOKEN_EXPIRED", 401);
  }
  return new AuthError("AUTH_TOKEN_INVALID_CLAIMS", 401);
}

/**
 * Create an AuthError for missing or malformed Authorization header.
 */
export function missingOrMalformedTokenError(): AuthError {
  return new AuthError("AUTH_TOKEN_MISSING_OR_MALFORMED", 401);
}

/**
 * Create an AuthError for forbidden access (valid token, insufficient permission).
 */
export function forbiddenError(): AuthError {
  return new AuthError("AUTH_FORBIDDEN", 403);
}

/**
 * Map an auth error code to its HTTP status code.
 */
export function authCodeToStatus(code: AuthErrorCode): 401 | 403 {
  if (code === "AUTH_FORBIDDEN") return 403;
  return 401;
}
