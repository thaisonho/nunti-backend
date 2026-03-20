import { DeviceRecord, DeviceStatus, IdentityKeyRecord, SignedPreKeyRecord, OneTimePreKeyRecord } from "./device-model.js";
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
  oneTimePreKeys?: OneTimePreKeyRecord[];
}

export interface GetBootstrapBundlePayload {
  actorUserId: string;
  actorDeviceId: string;
  targetUserId: string;
  targetDeviceId: string;
}

export interface BootstrapBundle {
  userId: string;
  deviceId: string;
  identityKey: IdentityKeyRecord;
  signedPreKey: SignedPreKeyRecord;
  oneTimePreKey: OneTimePreKeyRecord;
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

  const updated = await DeviceRepository.updateDeviceKeys({
    userId: payload.actorUserId,
    deviceId: payload.targetDeviceId,
    identityKey: payload.identityKey,
    signedPreKey: payload.signedPreKey,
  });

  if (payload.oneTimePreKeys) {
    await DeviceRepository.replaceOneTimePreKeys(payload.actorUserId, payload.targetDeviceId, payload.oneTimePreKeys);
  }

  return updated;
}

export async function getBootstrapBundle(payload: GetBootstrapBundlePayload): Promise<BootstrapBundle> {
  if (payload.actorUserId !== payload.targetUserId) {
    throw new AppError("AUTH_FORBIDDEN", "Device not found or not owned by caller", 403);
  }

  const actorDevice = await DeviceRepository.getDevice(payload.actorUserId, payload.actorDeviceId);
  if (!actorDevice || !isDeviceTrusted(actorDevice)) {
    throw new AppError("AUTH_FORBIDDEN", "Device not found or not owned by caller", 403);
  }

  const targetDevice = await DeviceRepository.getDevice(payload.targetUserId, payload.targetDeviceId);
  if (!targetDevice) {
    throw new AppError("AUTH_FORBIDDEN", "Device not found or not owned by caller", 403);
  }

  if (!targetDevice.identityKey || !targetDevice.signedPreKey) {
    throw new AppError("CONFLICT", "Device key state is incomplete", 409);
  }

  const oneTimePreKey = await DeviceRepository.consumeOneTimePreKey(payload.targetUserId, payload.targetDeviceId);
  return {
    userId: payload.targetUserId,
    deviceId: payload.targetDeviceId,
    identityKey: targetDevice.identityKey,
    signedPreKey: targetDevice.signedPreKey,
    oneTimePreKey,
  };
}
