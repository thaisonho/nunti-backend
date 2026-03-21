export enum DeviceStatus {
  TRUSTED = 'trusted',
  REVOKED = 'revoked',
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
}
