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
  dhPublicKey?: IdentityKeyRecord;
  signedPreKey: SignedPreKeyRecord;
  oneTimePreKeys?: OneTimePreKeyRecord[];
}

export interface ApproveDevicePayload {
  actorUserId: string;
  actorDeviceId: string;
  targetDeviceId: string;
  signatureByPrimary: string;
}

export interface GetBootstrapBundlePayload {
  targetUserId: string;
  targetDeviceId: string;
}

export interface BootstrapBundle {
  userId: string;
  deviceId: string;
  isPrimary: boolean;
  identityKey: IdentityKeyRecord;
  dhPublicKey?: IdentityKeyRecord;
  signedPreKey: SignedPreKeyRecord;
  oneTimePreKey: OneTimePreKeyRecord;
  primaryDeviceId?: string;
  primaryIdentityKey?: string;
}

function isPrimaryDevice(device: DeviceRecord): boolean {
  return device.isPrimary === true;
}

export async function registerDevice(payload: RegisterDevicePayload): Promise<DeviceRecord> {
  const existingDevices = await DeviceRepository.listDevicesByUser(payload.userId);
  const hasTrustedPrimary = existingDevices.some(
    (device) => device.status === DeviceStatus.TRUSTED && isPrimaryDevice(device),
  );

  const device = await DeviceRepository.upsertDevice({
    ...payload,
    status: hasTrustedPrimary ? DeviceStatus.PENDING : DeviceStatus.TRUSTED,
    isPrimary: !hasTrustedPrimary,
  });
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

  if (device.isPrimary) {
    throw new AppError("CONFLICT", "Primary device cannot be revoked while browser-only trust is enabled", 409);
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
  if (!actorDevice || actorDevice.status === DeviceStatus.REVOKED) {
    throw new AppError("AUTH_FORBIDDEN", "Device not found or not owned by caller", 403);
  }

  const targetDevice = await DeviceRepository.getDevice(payload.actorUserId, payload.targetDeviceId);
  if (!targetDevice) {
    throw new AppError("AUTH_FORBIDDEN", "Device not found or not owned by caller", 403);
  }

  if (targetDevice.status === DeviceStatus.REVOKED) {
    throw new AppError("AUTH_FORBIDDEN", "Target device is not trusted", 403);
  }

  const isSelfUpload = payload.actorDeviceId === payload.targetDeviceId;
  if (!isSelfUpload && !isDeviceTrusted(actorDevice)) {
    throw new AppError("AUTH_FORBIDDEN", "Only trusted devices can upload keys for another device", 403);
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
    dhPublicKey: payload.dhPublicKey,
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

export async function approveDevice(payload: ApproveDevicePayload): Promise<DeviceRecord> {
  const actorDevice = await DeviceRepository.getDevice(payload.actorUserId, payload.actorDeviceId);
  if (!actorDevice || !isDeviceTrusted(actorDevice) || !isPrimaryDevice(actorDevice)) {
    throw new AppError("AUTH_FORBIDDEN", "Only the trusted primary device can approve browsers", 403);
  }

  const targetDevice = await DeviceRepository.getDevice(payload.actorUserId, payload.targetDeviceId);
  if (!targetDevice || targetDevice.status === DeviceStatus.REVOKED) {
    throw new AppError("AUTH_FORBIDDEN", "Device not found or not owned by caller", 403);
  }

  if (targetDevice.isPrimary) {
    throw new AppError("CONFLICT", "Primary device does not require approval", 409);
  }

  if (!targetDevice.identityKey) {
    throw new AppError("CONFLICT", "Target device must upload keys before approval", 409);
  }

  const updated = await DeviceRepository.approveDevice({
    userId: payload.actorUserId,
    deviceId: payload.targetDeviceId,
    signatureByPrimary: payload.signatureByPrimary,
    approvedByDeviceId: payload.actorDeviceId,
  });

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

  let primaryDeviceId: string | undefined;
  let primaryIdentityKey: string | undefined;

  if (!isPrimaryDevice(targetDevice)) {
    if (!targetDevice.identityKey.signatureByPrimary) {
      throw new AppError("CONFLICT", "Approved secondary device is missing primary signature", 409);
    }

    if (!targetDevice.approvedByDeviceId) {
      throw new AppError("CONFLICT", "Approved secondary device is missing approving primary reference", 409);
    }

    const primaryDevice = await DeviceRepository.getDevice(
      payload.targetUserId,
      targetDevice.approvedByDeviceId,
    );

    if (
      !primaryDevice
      || primaryDevice.status !== DeviceStatus.TRUSTED
      || !isPrimaryDevice(primaryDevice)
      || !primaryDevice.identityKey?.publicKey
    ) {
      throw new AppError("CONFLICT", "Primary device identity is unavailable", 409);
    }

    primaryDeviceId = primaryDevice.deviceId;
    primaryIdentityKey = primaryDevice.identityKey.publicKey;
  }

  const oneTimePreKey = await DeviceRepository.consumeOneTimePreKey(payload.targetUserId, payload.targetDeviceId);
  return {
    userId: payload.targetUserId,
    deviceId: payload.targetDeviceId,
    isPrimary: isPrimaryDevice(targetDevice),
    identityKey: targetDevice.identityKey,
    dhPublicKey: targetDevice.dhPublicKey,
    signedPreKey: targetDevice.signedPreKey,
    oneTimePreKey,
    ...(primaryDeviceId ? { primaryDeviceId } : {}),
    ...(primaryIdentityKey ? { primaryIdentityKey } : {}),
  };
}
