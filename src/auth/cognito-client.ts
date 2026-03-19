/**
 * CognitoIdentityProvider client singleton.
 *
 * Shared across signup, signin, and resend-verification operations.
 * Instantiated outside handler for connection reuse across warm invocations.
 */

import {
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { getConfig } from "../app/config.js";

let clientInstance: CognitoIdentityProviderClient | null = null;

/**
 * Get or create the Cognito Identity Provider client singleton.
 */
export function getCognitoClient(): CognitoIdentityProviderClient {
  if (clientInstance) return clientInstance;

  const config = getConfig();
  clientInstance = new CognitoIdentityProviderClient({
    region: config.cognitoRegion,
  });

  return clientInstance;
}

/** Reset client singleton (for testing). */
export function resetCognitoClient(): void {
  clientInstance = null;
}
