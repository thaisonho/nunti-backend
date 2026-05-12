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
    isPrimary: true,
    registeredAt: now,
    lastSeenAt: now,
    deviceLabel: 'iPhone 13',
    platform: 'iOS',
    appVersion: '1.0.0'
  };

  it('registerDevice should write the first browser as trusted primary', async () => {
    vi.mocked(DeviceRepository.listDevicesByUser).mockResolvedValue([]);
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
      status: DeviceStatus.TRUSTED,
      isPrimary: true,
      deviceLabel: 'iPhone 13',
      platform: 'iOS',
      appVersion: '1.0.0'
    });
    expect(result.status).toBe(DeviceStatus.TRUSTED);
    expect(result.isPrimary).toBe(true);
  });

  it('registerDevice should write later browsers as pending secondary devices', async () => {
    vi.mocked(DeviceRepository.listDevicesByUser).mockResolvedValue([mockDevice]);
    vi.mocked(DeviceRepository.upsertDevice).mockResolvedValue({
      ...mockDevice,
      deviceId: 'dev-2',
      status: DeviceStatus.PENDING,
      isPrimary: false,
    });

    const result = await DeviceService.registerDevice({
      userId: 'user-1',
      deviceId: 'dev-2',
      deviceLabel: 'Chrome',
      platform: 'web',
      appVersion: '1.0.0'
    });

    expect(DeviceRepository.upsertDevice).toHaveBeenCalledWith({
      userId: 'user-1',
      deviceId: 'dev-2',
      status: DeviceStatus.PENDING,
      isPrimary: false,
      deviceLabel: 'Chrome',
      platform: 'web',
      appVersion: '1.0.0'
    });
    expect(result.status).toBe(DeviceStatus.PENDING);
    expect(result.isPrimary).toBe(false);
  });

  it('registerDevice should treat legacy trusted browser without isPrimary as the primary browser', async () => {
    vi.mocked(DeviceRepository.listDevicesByUser).mockResolvedValue([
      {
        ...mockDevice,
        isPrimary: undefined,
      },
    ]);
    vi.mocked(DeviceRepository.upsertDevice).mockResolvedValue({
      ...mockDevice,
      deviceId: 'dev-legacy-secondary',
      status: DeviceStatus.PENDING,
      isPrimary: false,
    });

    const result = await DeviceService.registerDevice({
      userId: 'user-1',
      deviceId: 'dev-legacy-secondary',
      deviceLabel: 'Chrome',
      platform: 'web',
      appVersion: '1.0.0'
    });

    expect(DeviceRepository.upsertDevice).toHaveBeenCalledWith({
      userId: 'user-1',
      deviceId: 'dev-legacy-secondary',
      status: DeviceStatus.PENDING,
      isPrimary: false,
      deviceLabel: 'Chrome',
      platform: 'web',
      appVersion: '1.0.0'
    });
    expect(result.status).toBe(DeviceStatus.PENDING);
  });

  it('listDevices should return devices for a user', async () => {
    vi.mocked(DeviceRepository.listDevicesByUser).mockResolvedValue([mockDevice]);

    const result = await DeviceService.listDevices('user-1');

    expect(DeviceRepository.listDevicesByUser).toHaveBeenCalledWith('user-1');
    expect(result).toHaveLength(1);
    expect(result[0].deviceId).toBe('dev-1');
  });

  it('revokeDevice should mark device as revoked and set revokedAt', async () => {
    vi.mocked(DeviceRepository.getDevice).mockResolvedValue({
      ...mockDevice,
      isPrimary: false,
    });
    vi.mocked(DeviceRepository.updateDeviceStatus).mockResolvedValue({
      ...mockDevice,
      status: DeviceStatus.REVOKED,
      isPrimary: false,
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

  it('revokeDevice should reject primary device revocation', async () => {
    vi.mocked(DeviceRepository.getDevice).mockResolvedValue(mockDevice);

    await expect(DeviceService.revokeDevice('user-1', 'dev-1'))
      .rejects
      .toMatchObject<AppError>({
        code: 'CONFLICT',
        statusCode: 409,
      });
  });

  it('revokeDevice should reject revocation of legacy trusted browser without isPrimary flag', async () => {
    vi.mocked(DeviceRepository.getDevice).mockResolvedValue({
      ...mockDevice,
      isPrimary: undefined,
    });

    await expect(DeviceService.revokeDevice('user-1', 'dev-1'))
      .rejects
      .toMatchObject<AppError>({
        code: 'CONFLICT',
        statusCode: 409,
      });
  });

  it('isDeviceTrusted policy should deny revoked devices', () => {
    expect(isDeviceTrusted(mockDevice)).toBe(true);
    
    expect(isDeviceTrusted({
      ...mockDevice,
      status: DeviceStatus.REVOKED,
      revokedAt: now
    })).toBe(false);

    expect(isDeviceTrusted({
      ...mockDevice,
      status: DeviceStatus.PENDING,
    })).toBe(false);
  });
});
