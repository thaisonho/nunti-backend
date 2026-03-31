import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/app/errors.js';
import * as DeviceRepository from '../../src/devices/device-repository.js';
import { resetConfig } from '../../src/app/config.js';

describe('key bundle repository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.COGNITO_USER_POOL_ID = 'pool';
    process.env.COGNITO_APP_CLIENT_ID = 'client';
    process.env.DEVICES_TABLE_NAME = 'devices-table';
    resetConfig();
  });

  it('consumes exactly one one-time prekey and retries when first delete loses contention', async () => {
    const sendSpy = vi.spyOn(DeviceRepository.ddbDocClient, 'send');

    sendSpy
      .mockResolvedValueOnce({
        Items: [
          { keyId: 'opk-1', algorithm: 'X25519', publicKey: 'opk-public-1' },
          { keyId: 'opk-2', algorithm: 'X25519', publicKey: 'opk-public-2' },
        ],
      })
      .mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      .mockResolvedValueOnce({});

    const consumed = await DeviceRepository.consumeOneTimePreKey('user-1', 'dev-target');

    expect(consumed.keyId).toBe('opk-2');
    expect(consumed.publicKey).toBe('opk-public-2');
  });

  it('throws conflict when no one-time prekeys remain', async () => {
    const sendSpy = vi.spyOn(DeviceRepository.ddbDocClient, 'send');
    sendSpy
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [] });

    await expect(DeviceRepository.consumeOneTimePreKey('user-1', 'dev-target')).rejects.toMatchObject<AppError>({
      code: 'CONFLICT',
      statusCode: 409,
    });
  });
});