/**
 * Unit tests for secret-store.
 *
 * Verifies fail-closed semantics:
 * - Missing secrets throw immediately
 * - Empty secrets throw immediately
 * - Resolved values are cached for the Lambda warm-container lifetime
 * - JSON key extraction works with validation
 * - No fallback to insecure defaults
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class {
    send = sendMock;
  },
  GetSecretValueCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

import {
  resolveSecret,
  resolveSecretKey,
  resetSecretCache,
  resetSecretClient,
} from '../../src/app/secret-store.js';

describe('secret-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockReset();
    resetSecretCache();
    resetSecretClient();
  });

  describe('resolveSecret', () => {
    it('resolves a secret by name', async () => {
      sendMock.mockResolvedValue({ SecretString: 'my-secret-value' });

      const result = await resolveSecret('prod/nunti/db-password');

      expect(result).toBe('my-secret-value');
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('caches resolved secrets for subsequent calls', async () => {
      sendMock.mockResolvedValue({ SecretString: 'cached-value' });

      const first = await resolveSecret('test-secret');
      const second = await resolveSecret('test-secret');

      expect(first).toBe('cached-value');
      expect(second).toBe('cached-value');
      expect(sendMock).toHaveBeenCalledTimes(1); // Only one API call
    });

    it('throws when Secrets Manager call fails', async () => {
      sendMock.mockRejectedValue(new Error('ResourceNotFoundException'));

      await expect(resolveSecret('missing-secret')).rejects.toThrow(
        'Failed to resolve secret "missing-secret"',
      );
    });

    it('throws when secret value is empty string', async () => {
      sendMock.mockResolvedValue({ SecretString: '' });

      await expect(resolveSecret('empty-secret')).rejects.toThrow(
        'resolved to an empty value',
      );
    });

    it('throws when secret value is whitespace only', async () => {
      sendMock.mockResolvedValue({ SecretString: '   ' });

      await expect(resolveSecret('whitespace-secret')).rejects.toThrow(
        'resolved to an empty value',
      );
    });

    it('throws when SecretString is undefined', async () => {
      sendMock.mockResolvedValue({ SecretString: undefined });

      await expect(resolveSecret('no-string-secret')).rejects.toThrow(
        'resolved to an empty value',
      );
    });
  });

  describe('resolveSecretKey', () => {
    it('extracts a key from a JSON secret', async () => {
      sendMock.mockResolvedValue({
        SecretString: JSON.stringify({ username: 'admin', password: 'hunter2' }),
      });

      const password = await resolveSecretKey('db-creds', 'password');
      expect(password).toBe('hunter2');
    });

    it('throws when JSON key is missing', async () => {
      sendMock.mockResolvedValue({
        SecretString: JSON.stringify({ username: 'admin' }),
      });

      await expect(resolveSecretKey('db-creds', 'password')).rejects.toThrow(
        'does not contain a non-empty value for key "password"',
      );
    });

    it('throws when secret is not valid JSON', async () => {
      sendMock.mockResolvedValue({ SecretString: 'not-json' });

      await expect(resolveSecretKey('bad-json', 'key')).rejects.toThrow(
        'is not valid JSON',
      );
    });

    it('throws when extracted value is empty string', async () => {
      sendMock.mockResolvedValue({
        SecretString: JSON.stringify({ password: '' }),
      });

      await expect(resolveSecretKey('db-creds', 'password')).rejects.toThrow(
        'does not contain a non-empty value',
      );
    });
  });
});
