import { DeviceRecord, DeviceStatus } from "./device-model.js";

export function isDeviceTrusted(device: DeviceRecord): boolean {
  return device.status === DeviceStatus.TRUSTED;
}
