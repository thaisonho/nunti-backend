import { DeviceRecord, DeviceStatus, IdentityKeyRecord, SignedPreKeyRecord, OneTimePreKeyRecord } from "./device-model.js";
import * as DeviceRepository from "./device-repository.js";
import { AppError } from "../app/errors.js";
import { isDeviceTrusted } from "./device-policy.js";
import { publishTrustChange } from "../realtime/trust-change-publisher.js";

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
  const device = await DeviceRepository.upsertDevice(payload);
  await publishTrustChange(payload.userId, {
    changeType: "device-registered",
    deviceId: payload.deviceId,
    timestamp: new Date().toISOString(),
  });
  return device;
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

  const updated = await DeviceRepository.updateDeviceStatus(userId, deviceId, DeviceStatus.REVOKED);
  await publishTrustChange(userId, {
    changeType: "device-revoked",
    deviceId,
    timestamp: new Date().toISOString(),
  });
  return updated;
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

  if (!isDeviceTrusted(targetDevice)) {
    throw new AppError("AUTH_FORBIDDEN", "Target device is not trusted", 403);
  }

  if (payload.oneTimePreKeys) {
    const uniqueKeyIds = new Set(payload.oneTimePreKeys.map((preKey) => preKey.keyId));
    if (uniqueKeyIds.size !== payload.oneTimePreKeys.length) {
      throw new AppError("VALIDATION_ERROR", "Duplicate one-time prekey keyId values are not allowed", 400);
    }
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

  await publishTrustChange(payload.actorUserId, {
    changeType: "keys-updated",
    deviceId: payload.targetDeviceId,
    timestamp: new Date().toISOString(),
  });

  return updated;
}

export async function getBootstrapBundle(payload: GetBootstrapBundlePayload): Promise<BootstrapBundle> {
  // Allow cross-user key bundle fetching (required for E2EE messaging)
  // Public keys are meant to be public - Signal Protocol standard behavior
  // The actor must still be authenticated with a trusted device

  const actorDevice = await DeviceRepository.getDevice(payload.actorUserId, payload.actorDeviceId);
  if (!actorDevice || !isDeviceTrusted(actorDevice)) {
    throw new AppError("AUTH_FORBIDDEN", "Actor device not found or not trusted", 403);
  }

  const targetDevice = await DeviceRepository.getDevice(payload.targetUserId, payload.targetDeviceId);
  if (!targetDevice) {
    throw new AppError("AUTH_FORBIDDEN", "Device not found or not owned by caller", 403);
  }

  if (!isDeviceTrusted(targetDevice)) {
    throw new AppError("AUTH_FORBIDDEN", "Target device is not trusted", 403);
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
