import { DeviceRecord, DeviceStatus, IdentityKeyRecord, SignedPreKeyRecord } from "./device-model.js";
import * as DeviceRepository from "./device-repository.js";
import { AppError } from "../app/errors.js";
import { isDeviceTrusted } from "./device-policy.js";

export interface RegisterDevicePayload {
  userId: string;
  deviceId: string;
  deviceLabel?: string;
  platform?: string;
  appVersion?: string;
}

export interface UploadDeviceKeysPayload {
  actorUserId: string;
  actorDeviceId: string;
  targetDeviceId: string;
  identityKey: IdentityKeyRecord;
  signedPreKey: SignedPreKeyRecord;
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

export async function uploadDeviceKeys(payload: UploadDeviceKeysPayload): Promise<DeviceRecord> {
  const actorDevice = await DeviceRepository.getDevice(payload.actorUserId, payload.actorDeviceId);
  if (!actorDevice || !isDeviceTrusted(actorDevice)) {
    throw new AppError("AUTH_FORBIDDEN", "Device not found or not owned by caller", 403);
  }

  const targetDevice = await DeviceRepository.getDevice(payload.actorUserId, payload.targetDeviceId);
  if (!targetDevice) {
    throw new AppError("AUTH_FORBIDDEN", "Device not found or not owned by caller", 403);
  }

  return DeviceRepository.updateDeviceKeys({
    userId: payload.actorUserId,
    deviceId: payload.targetDeviceId,
    identityKey: payload.identityKey,
    signedPreKey: payload.signedPreKey,
  });
}
