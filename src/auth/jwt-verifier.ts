/**
 * Cognito JWT Verifier — route-aware token verification.
 *
 * Uses aws-jwt-verify with explicit claim validation:
 * - userPoolId → derives expected issuer and JWKS URI
 * - clientId → validates aud (ID token) or client_id (access token)
 * - tokenUse → enforce expected token type
 *
 * Provides separate verifiers for access and ID tokens so protected
 * routes can accept the appropriate token type per route matrix.
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

let accessVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;
let idVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

/**
 * Get or create the Cognito access-token verifier singleton.
 * Validates access tokens with userPoolId, clientId, and tokenUse=access.
 */
export function getAccessTokenVerifier() {
  if (accessVerifier) return accessVerifier;

  const config = getConfig();
  accessVerifier = CognitoJwtVerifier.create({
    userPoolId: config.cognitoUserPoolId,
    tokenUse: "access",
    clientId: config.cognitoAppClientId,
  });

  return accessVerifier;
}

/**
 * Get or create the Cognito ID-token verifier singleton.
 * Validates ID tokens with userPoolId, clientId, and tokenUse=id.
 */
export function getIdTokenVerifier() {
  if (idVerifier) return idVerifier;

  const config = getConfig();
  idVerifier = CognitoJwtVerifier.create({
    userPoolId: config.cognitoUserPoolId,
    tokenUse: "id",
    clientId: config.cognitoAppClientId,
  });

  return idVerifier;
}

/** Reset verifier singletons (for testing). */
export function resetVerifier(): void {
  accessVerifier = null;
  idVerifier = null;
}
