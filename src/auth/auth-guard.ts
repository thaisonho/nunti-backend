/**
 * Auth guard — reusable bearer token parsing and Cognito claim verification.
 *
 * Enforces:
 * - Strict "Bearer <token>" format
 * - Missing/malformed → 401 AUTH_TOKEN_MISSING_OR_MALFORMED
 * - Expired → 401 AUTH_TOKEN_EXPIRED
 * - Invalid claims → 401 AUTH_TOKEN_INVALID_CLAIMS
 * - Valid token payload returned for downstream handlers
 */

import { getAccessTokenVerifier } from "./jwt-verifier.js";
import {
  missingOrMalformedTokenError,
  mapVerifierError,
} from "./auth-error-mapper.js";

export interface AuthenticatedUser {
  sub: string;
  email?: string;
  username?: string;
  tokenUse: string;
  [key: string]: unknown;
}

/**
 * Extract Bearer token from Authorization header and verify against Cognito.
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
  } catch (error) {
    throw mapVerifierError(error);
  }
}
