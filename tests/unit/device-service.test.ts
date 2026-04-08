import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../src/app/errors.js';
import * as DeviceService from '../../src/devices/device-service.js';
import * as DeviceRepository from '../../src/devices/device-repository.js';
import { isDeviceTrusted } from '../../src/devices/device-policy.js';
import { DeviceStatus, DeviceRecord } from '../../src/devices/device-model.js';

vi.mock('../../src/devices/device-repository.js');

describe('Device Service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const now = new Date().toISOString();
  const mockDevice: DeviceRecord = {
    userId: 'user-1',
    deviceId: 'dev-1',
    status: DeviceStatus.TRUSTED,
    registeredAt: now,
    lastSeenAt: now,
    deviceLabel: 'iPhone 13',
    platform: 'iOS',
    appVersion: '1.0.0'
  };

  it('registerDevice should write a trusted device record', async () => {
    vi.mocked(DeviceRepository.upsertDevice).mockResolvedValue(mockDevice);
    
    const result = await DeviceService.registerDevice({
      userId: 'user-1',
      deviceId: 'dev-1',
      deviceLabel: 'iPhone 13',
      platform: 'iOS',
      appVersion: '1.0.0'
    });

    expect(DeviceRepository.upsertDevice).toHaveBeenCalledWith({
      userId: 'user-1',
      deviceId: 'dev-1',
      deviceLabel: 'iPhone 13',
      platform: 'iOS',
      appVersion: '1.0.0'
    });
    expect(result.status).toBe(DeviceStatus.TRUSTED);
  });

  it('listDevices should return devices for a user', async () => {
    vi.mocked(DeviceRepository.listDevicesByUser).mockResolvedValue([mockDevice]);

    const result = await DeviceService.listDevices('user-1');

    expect(DeviceRepository.listDevicesByUser).toHaveBeenCalledWith('user-1');
    expect(result).toHaveLength(1);
    expect(result[0].deviceId).toBe('dev-1');
  });

  it('revokeDevice should mark device as revoked and set revokedAt', async () => {
    vi.mocked(DeviceRepository.getDevice).mockResolvedValue(mockDevice);
    vi.mocked(DeviceRepository.updateDeviceStatus).mockResolvedValue({
      ...mockDevice,
      status: DeviceStatus.REVOKED,
      revokedAt: now
    });

    const result = await DeviceService.revokeDevice('user-1', 'dev-1');

    expect(DeviceRepository.updateDeviceStatus).toHaveBeenCalledWith(
      'user-1',
      'dev-1',
      DeviceStatus.REVOKED
    );
    expect(result.status).toBe(DeviceStatus.REVOKED);
    expect(result.revokedAt).toBeDefined();
  });

  it('revokeDevice should throw 403 or 404 for cross-user or missing attempt', async () => {
    vi.mocked(DeviceRepository.getDevice).mockResolvedValue(null);

    await expect(DeviceService.revokeDevice('user-1', 'dev-1'))
      .rejects
      .toThrow(AppError);
  });

  it('isDeviceTrusted policy should deny revoked devices', () => {
    expect(isDeviceTrusted(mockDevice)).toBe(true);
    
    expect(isDeviceTrusted({
      ...mockDevice,
      status: DeviceStatus.REVOKED,
      revokedAt: now
    })).toBe(false);
  });
});
