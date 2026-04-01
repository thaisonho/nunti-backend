/**
 * Application configuration parsed from environment variables.
 * All required values must be present at runtime for Lambda execution.
 */

export interface AppConfig {
  readonly cognitoUserPoolId: string;
  readonly cognitoAppClientId: string;
  readonly cognitoRegion: string;
  readonly devicesTableName: string;
  readonly messagesTableName: string;
  readonly stage: string;
}

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const required = (key: string): string => {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  };

  cachedConfig = {
    cognitoUserPoolId: required("COGNITO_USER_POOL_ID"),
    cognitoAppClientId: required("COGNITO_APP_CLIENT_ID"),
    cognitoRegion: process.env.COGNITO_REGION ?? process.env.AWS_REGION ?? "ap-southeast-1",
    devicesTableName: required("DEVICES_TABLE_NAME"),
    messagesTableName: required("MESSAGES_TABLE_NAME"),
    stage: process.env.STAGE ?? "dev",
  };

  return cachedConfig;
}

/** Reset cached config (for testing). */
export function resetConfig(): void {
  cachedConfig = null;
}
