/**
 * Cognito JWT Verifier singleton.
 *
 * Uses aws-jwt-verify with explicit claim validation:
 * - userPoolId → derives expected issuer and JWKS URI
 * - clientId → validates aud (ID token) or client_id (access token)
 * - tokenUse → enforce expected token type (access for API auth)
 *
 * Instantiated outside handler for JWKS cache reuse across warm invocations.
 */

import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getConfig } from "../app/config.js";

export type JwtPayload = {
  sub: string;
  email?: string;
  "cognito:username"?: string;
  token_use: string;
  auth_time: number;
  iss: string;
  exp: number;
  iat: number;
  client_id?: string;
  [key: string]: unknown;
};

let verifierInstance: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

/**
 * Get or create the Cognito JWT verifier singleton.
 * Validates access tokens with userPoolId, clientId, and tokenUse claims.
 */
export function getAccessTokenVerifier() {
  if (verifierInstance) return verifierInstance;

  const config = getConfig();
  verifierInstance = CognitoJwtVerifier.create({
    userPoolId: config.cognitoUserPoolId,
    tokenUse: "access",
    clientId: config.cognitoAppClientId,
  });

  return verifierInstance;
}

/** Reset verifier singleton (for testing). */
export function resetVerifier(): void {
  verifierInstance = null;
}
