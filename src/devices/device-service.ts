import { DeviceRecord, DeviceStatus } from "./device-model.js";
import * as DeviceRepository from "./device-repository.js";
import { AppError } from "../app/errors.js";

export interface RegisterDevicePayload {
  userId: string;
  deviceId: string;
  deviceLabel?: string;
  platform?: string;
  appVersion?: string;
}

export async function registerDevice(payload: RegisterDevicePayload): Promise<DeviceRecord> {
  return DeviceRepository.upsertDevice(payload);
}

export async function listDevices(userId: string): Promise<DeviceRecord[]> {
  return DeviceRepository.listDevicesByUser(userId);
}

export async function revokeDevice(userId: string, deviceId: string): Promise<DeviceRecord> {
  const device = await DeviceRepository.getDevice(userId, deviceId);
  if (!device) {
    throw new AppError("AUTH_FORBIDDEN", "Device not found or not owned by caller", 403);
  }

  if (device.status === DeviceStatus.REVOKED) {
    return device;
  }

  return DeviceRepository.updateDeviceStatus(userId, deviceId, DeviceStatus.REVOKED);
}
