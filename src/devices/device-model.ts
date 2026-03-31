export enum DeviceStatus {
  TRUSTED = 'trusted',
  REVOKED = 'revoked',
}

export interface IdentityKeyRecord {
  keyId: string;
  algorithm: string;
  publicKey: string;
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
  registeredAt: string;
  lastSeenAt: string;
  deviceLabel?: string;
  platform?: string;
  appVersion?: string;
  revokedAt?: string;
  keyStateUpdatedAt?: string;
  identityKey?: IdentityKeyRecord;
  signedPreKey?: SignedPreKeyRecord;
}
