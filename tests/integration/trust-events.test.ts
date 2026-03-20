import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as DeviceService from '../../src/devices/device-service.js';
import { DeviceStatus } from '../../src/devices/device-model.js';
import * as DeviceRepository from '../../src/devices/device-repository.js';
import * as TrustPublisher from '../../src/realtime/trust-change-publisher.js';

vi.mock('../../src/devices/device-repository.js');
vi.mock('../../src/realtime/trust-change-publisher.js');

describe('trust change integration (service -> publisher)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits trust-change for trusted registration', async () => {
    vi.mocked(DeviceRepository.upsertDevice).mockResolvedValue({
      userId: 'user-1',
      deviceId: 'dev-new',
      status: DeviceStatus.TRUSTED,
      registeredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });

    await DeviceService.registerDevice({
      userId: 'user-1',
      deviceId: 'dev-new',
    });

    expect(TrustPublisher.publishTrustChange).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        changeType: 'device-registered',
        deviceId: 'dev-new',
      }),
    );
  });

  it('emits trust-change for key upload replacement', async () => {
    const now = new Date().toISOString();
    vi.mocked(DeviceRepository.getDevice)
      .mockResolvedValueOnce({
        userId: 'user-1',
        deviceId: 'dev-actor',
        status: DeviceStatus.TRUSTED,
        registeredAt: now,
        lastSeenAt: now,
      })
      .mockResolvedValueOnce({
        userId: 'user-1',
        deviceId: 'dev-target',
        status: DeviceStatus.TRUSTED,
        registeredAt: now,
        lastSeenAt: now,
      });

    vi.mocked(DeviceRepository.updateDeviceKeys).mockResolvedValue({
      userId: 'user-1',
      deviceId: 'dev-target',
      status: DeviceStatus.TRUSTED,
      registeredAt: now,
      lastSeenAt: now,
      keyStateUpdatedAt: now,
      identityKey: { keyId: 'ik', algorithm: 'X25519', publicKey: 'ik-pub' },
      signedPreKey: { keyId: 'spk', algorithm: 'Ed25519', publicKey: 'spk-pub', signature: 'sig' },
    });

    await DeviceService.uploadDeviceKeys({
      actorUserId: 'user-1',
      actorDeviceId: 'dev-actor',
      targetDeviceId: 'dev-target',
      identityKey: { keyId: 'ik', algorithm: 'X25519', publicKey: 'ik-pub' },
      signedPreKey: { keyId: 'spk', algorithm: 'Ed25519', publicKey: 'spk-pub', signature: 'sig' },
    });

    expect(TrustPublisher.publishTrustChange).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        changeType: 'keys-updated',
        deviceId: 'dev-target',
      }),
    );
  });

  it('emits trust-change for device revoke', async () => {
    const now = new Date().toISOString();
    vi.mocked(DeviceRepository.getDevice).mockResolvedValue({
      userId: 'user-1',
      deviceId: 'dev-target',
      status: DeviceStatus.TRUSTED,
      registeredAt: now,
      lastSeenAt: now,
    });
    vi.mocked(DeviceRepository.updateDeviceStatus).mockResolvedValue({
      userId: 'user-1',
      deviceId: 'dev-target',
      status: DeviceStatus.REVOKED,
      registeredAt: now,
      lastSeenAt: now,
      revokedAt: now,
    });

    await DeviceService.revokeDevice('user-1', 'dev-target');

    expect(TrustPublisher.publishTrustChange).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        changeType: 'device-revoked',
        deviceId: 'dev-target',
      }),
    );
  });
});