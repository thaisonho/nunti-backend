export enum DeviceStatus {
  PENDING = 'pending',
  TRUSTED = 'trusted',
  REVOKED = 'revoked',
}

export interface IdentityKeyRecord {
  keyId: string;
  algorithm: string;
  publicKey: string;
  signatureByPrimary?: string;
}

export interface SignedPreKeyRecord {
  keyId: string;
  algorithm: string;
  publicKey: string;
  signature: string;
}

export interface OneTimePreKeyRecord {
  keyId: string;
  algorithm: string;
  publicKey: string;
}

export interface DeviceRecord {
  userId: string;
  deviceId: string;
  status: DeviceStatus;
  isPrimary?: boolean;
  registeredAt: string;
  lastSeenAt: string;
  deviceLabel?: string;
  platform?: string;
  appVersion?: string;
  revokedAt?: string;
  approvedAt?: string;
  approvedByDeviceId?: string;
  keyStateUpdatedAt?: string;
  identityKey?: IdentityKeyRecord;
  dhPublicKey?: IdentityKeyRecord;
  signedPreKey?: SignedPreKeyRecord;
}
