import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/app/errors.js';
import { DeviceStatus, type DeviceRecord } from '../../src/devices/device-model.js';
import * as DeviceRepository from '../../src/devices/device-repository.js';
import * as DeviceService from '../../src/devices/device-service.js';

vi.mock('../../src/devices/device-repository.js');

describe('device key upload service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const now = new Date().toISOString();

  const trustedActor: DeviceRecord = {
    userId: 'user-1',
    deviceId: 'dev-actor',
    status: DeviceStatus.TRUSTED,
    isPrimary: true,
    registeredAt: now,
    lastSeenAt: now,
  };

  const trustedTarget: DeviceRecord = {
    userId: 'user-1',
    deviceId: 'dev-target',
    status: DeviceStatus.TRUSTED,
    isPrimary: false,
    registeredAt: now,
    lastSeenAt: now,
  };

  const pendingSelfDevice: DeviceRecord = {
    userId: 'user-1',
    deviceId: 'dev-pending',
    status: DeviceStatus.PENDING,
    isPrimary: false,
    registeredAt: now,
    lastSeenAt: now,
  };

  it('allows trusted same-account actor to replace target key state', async () => {
    vi.mocked(DeviceRepository.getDevice)
      .mockResolvedValueOnce(trustedActor)
      .mockResolvedValueOnce(trustedTarget);
    vi.mocked(DeviceRepository.updateDeviceKeys).mockResolvedValue({
      ...trustedTarget,
      keyStateUpdatedAt: now,
      identityKey: {
        keyId: 'ik-1',
        algorithm: 'X25519',
        publicKey: 'base64-public-identity',
      },
      signedPreKey: {
        keyId: 'spk-1',
        algorithm: 'Ed25519',
        publicKey: 'base64-public-signed-prekey',
        signature: 'base64-signature',
      },
    });

    const result = await DeviceService.uploadDeviceKeys({
      actorUserId: 'user-1',
      actorDeviceId: 'dev-actor',
      targetDeviceId: 'dev-target',
      identityKey: {
        keyId: 'ik-1',
        algorithm: 'X25519',
        publicKey: 'base64-public-identity',
      },
      signedPreKey: {
        keyId: 'spk-1',
        algorithm: 'Ed25519',
        publicKey: 'base64-public-signed-prekey',
        signature: 'base64-signature',
      },
    });

    expect(DeviceRepository.updateDeviceKeys).toHaveBeenCalledWith({
      userId: 'user-1',
      deviceId: 'dev-target',
      identityKey: {
        keyId: 'ik-1',
        algorithm: 'X25519',
        publicKey: 'base64-public-identity',
      },
      signedPreKey: {
        keyId: 'spk-1',
        algorithm: 'Ed25519',
        publicKey: 'base64-public-signed-prekey',
        signature: 'base64-signature',
      },
    });
    expect(result.identityKey?.keyId).toBe('ik-1');
    expect(result.signedPreKey?.keyId).toBe('spk-1');
  });

  it('rejects when actor device is missing', async () => {
    vi.mocked(DeviceRepository.getDevice).mockResolvedValueOnce(null);

    await expect(
      DeviceService.uploadDeviceKeys({
        actorUserId: 'user-1',
        actorDeviceId: 'dev-actor',
        targetDeviceId: 'dev-target',
        identityKey: {
          keyId: 'ik-1',
          algorithm: 'X25519',
          publicKey: 'base64-public-identity',
        },
        signedPreKey: {
          keyId: 'spk-1',
          algorithm: 'Ed25519',
          publicKey: 'base64-public-signed-prekey',
          signature: 'base64-signature',
        },
      }),
    ).rejects.toThrow(AppError);
  });

  it('rejects when actor device is revoked', async () => {
    vi.mocked(DeviceRepository.getDevice).mockResolvedValueOnce({
      ...trustedActor,
      status: DeviceStatus.REVOKED,
      revokedAt: now,
    });

    await expect(
      DeviceService.uploadDeviceKeys({
        actorUserId: 'user-1',
        actorDeviceId: 'dev-actor',
        targetDeviceId: 'dev-target',
        identityKey: {
          keyId: 'ik-1',
          algorithm: 'X25519',
          publicKey: 'base64-public-identity',
        },
        signedPreKey: {
          keyId: 'spk-1',
          algorithm: 'Ed25519',
          publicKey: 'base64-public-signed-prekey',
          signature: 'base64-signature',
        },
      }),
    ).rejects.toThrow(AppError);
  });

  it('rejects when target device is not owned by actor user', async () => {
    vi.mocked(DeviceRepository.getDevice)
      .mockResolvedValueOnce(trustedActor)
      .mockResolvedValueOnce(null);

    await expect(
      DeviceService.uploadDeviceKeys({
        actorUserId: 'user-1',
        actorDeviceId: 'dev-actor',
        targetDeviceId: 'dev-target',
        identityKey: {
          keyId: 'ik-1',
          algorithm: 'X25519',
          publicKey: 'base64-public-identity',
        },
        signedPreKey: {
          keyId: 'spk-1',
          algorithm: 'Ed25519',
          publicKey: 'base64-public-signed-prekey',
          signature: 'base64-signature',
        },
      }),
    ).rejects.toThrow(AppError);
  });

  it('rejects when target device is revoked', async () => {
    vi.mocked(DeviceRepository.getDevice)
      .mockResolvedValueOnce(trustedActor)
      .mockResolvedValueOnce({
        ...trustedTarget,
        status: DeviceStatus.REVOKED,
        revokedAt: now,
      });

    await expect(
      DeviceService.uploadDeviceKeys({
        actorUserId: 'user-1',
        actorDeviceId: 'dev-actor',
        targetDeviceId: 'dev-target',
        identityKey: {
          keyId: 'ik-1',
          algorithm: 'X25519',
          publicKey: 'base64-public-identity',
        },
        signedPreKey: {
          keyId: 'spk-1',
          algorithm: 'Ed25519',
          publicKey: 'base64-public-signed-prekey',
          signature: 'base64-signature',
        },
      }),
    ).rejects.toThrow(AppError);
  });

  it('rejects duplicate one-time prekey keyIds', async () => {
    vi.mocked(DeviceRepository.getDevice)
      .mockResolvedValueOnce(trustedActor)
      .mockResolvedValueOnce(trustedTarget);

    await expect(
      DeviceService.uploadDeviceKeys({
        actorUserId: 'user-1',
        actorDeviceId: 'dev-actor',
        targetDeviceId: 'dev-target',
        identityKey: {
          keyId: 'ik-1',
          algorithm: 'X25519',
          publicKey: 'base64-public-identity',
        },
        signedPreKey: {
          keyId: 'spk-1',
          algorithm: 'Ed25519',
          publicKey: 'base64-public-signed-prekey',
          signature: 'base64-signature',
        },
        oneTimePreKeys: [
          { keyId: 'opk-1', algorithm: 'X25519', publicKey: 'pk-a' },
          { keyId: 'opk-1', algorithm: 'X25519', publicKey: 'pk-b' },
        ],
      }),
    ).rejects.toMatchObject<AppError>({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('allows pending browser to upload its own keys before approval', async () => {
    vi.mocked(DeviceRepository.getDevice)
      .mockResolvedValueOnce(pendingSelfDevice)
      .mockResolvedValueOnce(pendingSelfDevice);
    vi.mocked(DeviceRepository.updateDeviceKeys).mockResolvedValue({
      ...pendingSelfDevice,
      identityKey: {
        keyId: 'ik-2',
        algorithm: 'Ed25519',
        publicKey: 'base64-pending-identity',
      },
      signedPreKey: {
        keyId: 'spk-2',
        algorithm: 'Curve25519',
        publicKey: 'base64-pending-spk',
        signature: 'base64-signature',
      },
    });

    await expect(
      DeviceService.uploadDeviceKeys({
        actorUserId: 'user-1',
        actorDeviceId: 'dev-pending',
        targetDeviceId: 'dev-pending',
        identityKey: {
          keyId: 'ik-2',
          algorithm: 'Ed25519',
          publicKey: 'base64-pending-identity',
        },
        signedPreKey: {
          keyId: 'spk-2',
          algorithm: 'Curve25519',
          publicKey: 'base64-pending-spk',
          signature: 'base64-signature',
        },
      }),
    ).resolves.toBeTruthy();
  });

  it('allows trusted primary browser to approve a pending browser', async () => {
    vi.mocked(DeviceRepository.getDevice)
      .mockResolvedValueOnce(trustedActor)
      .mockResolvedValueOnce({
        ...pendingSelfDevice,
        identityKey: {
          keyId: 'ik-pending',
          algorithm: 'Ed25519',
          publicKey: 'base64-pending-identity',
        },
      });
    vi.mocked(DeviceRepository.approveDevice).mockResolvedValue({
      ...pendingSelfDevice,
      status: DeviceStatus.TRUSTED,
      approvedAt: now,
      approvedByDeviceId: 'dev-actor',
      identityKey: {
        keyId: 'ik-pending',
        algorithm: 'Ed25519',
        publicKey: 'base64-pending-identity',
        signatureByPrimary: 'base64-primary-signature',
      },
    });

    const result = await DeviceService.approveDevice({
      actorUserId: 'user-1',
      actorDeviceId: 'dev-actor',
      targetDeviceId: 'dev-pending',
      signatureByPrimary: 'base64-primary-signature',
    });

    expect(DeviceRepository.approveDevice).toHaveBeenCalledWith({
      userId: 'user-1',
      deviceId: 'dev-pending',
      signatureByPrimary: 'base64-primary-signature',
      approvedByDeviceId: 'dev-actor',
    });
    expect(result.status).toBe(DeviceStatus.TRUSTED);
  });
});
