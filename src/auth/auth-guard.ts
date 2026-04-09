/**
 * Auth guard — reusable bearer token parsing and Cognito claim verification.
 *
 * Accepts both access tokens and ID tokens per the route matrix.
 * Token type is determined by verification — access verifier is tried first,
 * and if it fails with a non-expiry error, the ID verifier is attempted.
 *
 * Enforces:
 * - Strict "Bearer <token>" format
 * - Missing/malformed → 401 AUTH_TOKEN_MISSING_OR_MALFORMED
 * - Expired → 401 AUTH_TOKEN_EXPIRED
 * - Invalid claims → 401 AUTH_TOKEN_INVALID_CLAIMS
 * - Valid token payload returned for downstream handlers
 */

import { getAccessTokenVerifier, getIdTokenVerifier } from "./jwt-verifier.js";
import {
  missingOrMalformedTokenError,
  mapVerifierError,
} from "./auth-error-mapper.js";
import { isExpiredTokenError } from "./auth-error-mapper.js";

export interface AuthenticatedUser {
  sub: string;
  email?: string;
  username?: string;
  tokenUse: string;
  [key: string]: unknown;
}

/**
 * Extract Bearer token from Authorization header and verify against Cognito.
 * Accepts both access and ID tokens — access is tried first, then ID.
 *
 * @param authorizationHeader - The raw Authorization header value
 * @returns Verified user claims
 * @throws AuthError with appropriate machine code
 */
export async function requireAuth(
  authorizationHeader?: string | null,
): Promise<AuthenticatedUser> {
  // Missing or malformed Authorization header
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    throw missingOrMalformedTokenError();
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();

  if (!token) {
    throw missingOrMalformedTokenError();
  }

  // Try access token first
  try {
    const verifier = getAccessTokenVerifier();
    const payload = await verifier.verify(token);

    return {
      sub: payload.sub,
      email: (payload as Record<string, unknown>).email as string | undefined,
      username: (payload as Record<string, unknown>)[
        "cognito:username"
      ] as string | undefined,
      tokenUse: payload.token_use as string,
    };
  } catch (accessError) {
    // If token is expired, don't try ID verifier — it's expired regardless
    if (isExpiredTokenError(accessError)) {
      throw mapVerifierError(accessError);
    }

    // Try ID token verifier as fallback
    try {
      const idVerifier = getIdTokenVerifier();
      const payload = await idVerifier.verify(token);

      return {
        sub: payload.sub,
        email: (payload as Record<string, unknown>).email as string | undefined,
        username: (payload as Record<string, unknown>)[
          "cognito:username"
        ] as string | undefined,
        tokenUse: payload.token_use as string,
      };
    } catch (idError) {
      // If ID token is expired, report that
      if (isExpiredTokenError(idError)) {
        throw mapVerifierError(idError);
      }
      // Neither access nor ID verified — report invalid claims
      throw mapVerifierError(accessError);
    }
  }
}
