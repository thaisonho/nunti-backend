/**
 * Unit tests for config.
 *
 * Verifies:
 * - All required env vars must be present
 * - Missing required env vars throw immediately
 * - Optional vars have safe defaults
 * - Config is cached after first call
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfig, resetConfig } from '../../src/app/config.js';

describe('config', () => {
  const originalEnv = { ...process.env };
  const touchedKeys = [
    'COGNITO_USER_POOL_ID',
    'COGNITO_APP_CLIENT_ID',
    'COGNITO_APP_CLIENT_SECRET',
    'DEVICES_TABLE_NAME',
    'MESSAGES_TABLE_NAME',
    'COGNITO_REGION',
    'AWS_REGION',
    'STAGE',
  ] as const;

  beforeEach(() => {
    resetConfig();
    // Set required environment variables
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_TestPool';
    process.env.COGNITO_APP_CLIENT_ID = 'test-client-id';
    process.env.DEVICES_TABLE_NAME = 'test-devices';
    process.env.MESSAGES_TABLE_NAME = 'test-messages';
  });

  afterEach(() => {
    // Restore only the env keys this suite mutates.
    for (const key of touchedKeys) {
      const originalValue = originalEnv[key];
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
    resetConfig();
  });

  it('returns config with all required values present', () => {
    const config = getConfig();

    expect(config.cognitoUserPoolId).toBe('us-east-1_TestPool');
    expect(config.cognitoAppClientId).toBe('test-client-id');
    expect(config.cognitoAppClientSecret).toBeUndefined();
    expect(config.devicesTableName).toBe('test-devices');
    expect(config.messagesTableName).toBe('test-messages');
  });

  it('reads optional COGNITO_APP_CLIENT_SECRET when provided', () => {
    process.env.COGNITO_APP_CLIENT_SECRET = 'test-secret';

    const config = getConfig();

    expect(config.cognitoAppClientSecret).toBe('test-secret');
  });

  it('throws when COGNITO_USER_POOL_ID is missing', () => {
    delete process.env.COGNITO_USER_POOL_ID;

    expect(() => getConfig()).toThrow('Missing required environment variable: COGNITO_USER_POOL_ID');
  });

  it('throws when COGNITO_APP_CLIENT_ID is missing', () => {
    delete process.env.COGNITO_APP_CLIENT_ID;

    expect(() => getConfig()).toThrow('Missing required environment variable: COGNITO_APP_CLIENT_ID');
  });

  it('throws when DEVICES_TABLE_NAME is missing', () => {
    delete process.env.DEVICES_TABLE_NAME;

    expect(() => getConfig()).toThrow('Missing required environment variable: DEVICES_TABLE_NAME');
  });

  it('throws when MESSAGES_TABLE_NAME is missing', () => {
    delete process.env.MESSAGES_TABLE_NAME;

    expect(() => getConfig()).toThrow('Missing required environment variable: MESSAGES_TABLE_NAME');
  });

  it('uses safe defaults for optional values', () => {
    delete process.env.COGNITO_REGION;
    delete process.env.AWS_REGION;
    delete process.env.STAGE;

    const config = getConfig();

    expect(config.cognitoRegion).toBe('ap-southeast-1');
    expect(config.stage).toBe('dev');
  });

  it('caches config after first call', () => {
    const first = getConfig();
    process.env.COGNITO_USER_POOL_ID = 'changed-pool'; // Change env
    const second = getConfig();

    expect(first).toBe(second); // Same reference — cached
    expect(second.cognitoUserPoolId).toBe('us-east-1_TestPool'); // Original value
  });

  it('resetConfig clears cache', () => {
    getConfig(); // Populate cache
    process.env.COGNITO_USER_POOL_ID = 'new-pool-id';
    resetConfig();
    const fresh = getConfig();

    expect(fresh.cognitoUserPoolId).toBe('new-pool-id');
  });
});
