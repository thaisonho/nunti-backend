/**
 * Secrets Manager-backed secret resolution with in-memory caching.
 *
 * Provides a fail-closed secret resolver:
 *   - Required secrets throw immediately if missing or empty
 *   - Resolved values are cached for the Lambda execution lifetime
 *   - No insecure fallback defaults
 *
 * Usage:
 *   const dbPassword = await resolveSecret('prod/nunti/db-password');
 *   const apiKey = await resolveSecret('arn:aws:secretsmanager:...');
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

let clientInstance: SecretsManagerClient | null = null;

function getClient(): SecretsManagerClient {
  if (clientInstance) return clientInstance;
  clientInstance = new SecretsManagerClient({});
  return clientInstance;
}

/** In-memory cache for resolved secrets (per Lambda warm invocation). */
const secretCache = new Map<string, string>();

/**
 * Resolve a secret by name or ARN from AWS Secrets Manager.
 *
 * Fails closed:
 *   - Throws if the secret cannot be retrieved
 *   - Throws if the resolved value is empty or undefined
 *   - No fallback to environment variables or defaults
 *
 * Caches resolved values for the Lambda execution lifetime.
 *
 * @param secretId - Secret name or full ARN
 * @returns The resolved secret string
 * @throws Error if the secret is missing, empty, or inaccessible
 */
export async function resolveSecret(secretId: string): Promise<string> {
  // Return cached value if available
  const cached = secretCache.get(secretId);
  if (cached !== undefined) return cached;

  const client = getClient();

  let secretValue: string | undefined;
  try {
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretId }),
    );
    secretValue = response.SecretString;
  } catch (error) {
    throw new Error(
      `Failed to resolve secret "${secretId}": ${(error as Error).message}`,
    );
  }

  if (!secretValue || secretValue.trim().length === 0) {
    throw new Error(
      `Secret "${secretId}" resolved to an empty value — refusing to continue`,
    );
  }

  secretCache.set(secretId, secretValue);
  return secretValue;
}

/**
 * Resolve a JSON secret and extract a specific key.
 * Useful for multi-field secrets (e.g., database credentials).
 *
 * @param secretId - Secret name or full ARN
 * @param key - JSON key to extract
 * @returns The extracted value as a string
 * @throws Error if the secret is missing, not valid JSON, or the key is missing
 */
export async function resolveSecretKey(
  secretId: string,
  key: string,
): Promise<string> {
  const raw = await resolveSecret(secretId);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Secret "${secretId}" is not valid JSON — cannot extract key "${key}"`,
    );
  }

  const value = parsed[key];
  if (value === undefined || value === null || String(value).trim().length === 0) {
    throw new Error(
      `Secret "${secretId}" does not contain a non-empty value for key "${key}"`,
    );
  }

  return String(value);
}

/** Clear the secret cache (for testing). */
export function resetSecretCache(): void {
  secretCache.clear();
}

/** Reset the Secrets Manager client (for testing). */
export function resetSecretClient(): void {
  clientInstance = null;
}
