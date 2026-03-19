import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DeviceRecord, DeviceStatus } from "./device-model.js";
import { getConfig } from "../app/config.js";

const client = new DynamoDBClient({});
export const ddbDocClient = DynamoDBDocumentClient.from(client);

interface UpsertParams {
  userId: string;
  deviceId: string;
  deviceLabel?: string;
  platform?: string;
  appVersion?: string;
}

function getTableName(): string {
  return getConfig().devicesTableName;
}

export async function upsertDevice(params: UpsertParams): Promise<DeviceRecord> {
  const now = new Date().toISOString();
  const record: DeviceRecord = {
    userId: params.userId,
    deviceId: params.deviceId,
    status: DeviceStatus.TRUSTED,
    registeredAt: now,
    lastSeenAt: now,
    deviceLabel: params.deviceLabel,
    platform: params.platform,
    appVersion: params.appVersion,
  };

  await ddbDocClient.send(new PutCommand({
    TableName: getTableName(),
    Item: {
      pk: `USER#${params.userId}`,
      sk: `DEVICE#${params.deviceId}`,
      ...record
    }
  }));

  return record;
}

function toDeviceRecord(item: Record<string, unknown>): DeviceRecord {
  return {
    userId: item.userId as string,
    deviceId: item.deviceId as string,
    status: item.status as DeviceStatus,
    registeredAt: item.registeredAt as string,
    lastSeenAt: item.lastSeenAt as string,
    ...(item.deviceLabel !== undefined && { deviceLabel: item.deviceLabel as string }),
    ...(item.platform !== undefined && { platform: item.platform as string }),
    ...(item.appVersion !== undefined && { appVersion: item.appVersion as string }),
    ...(item.revokedAt !== undefined && { revokedAt: item.revokedAt as string }),
  };
}

export async function getDevice(userId: string, deviceId: string): Promise<DeviceRecord | null> {
  const result = await ddbDocClient.send(new GetCommand({
    TableName: getTableName(),
    Key: {
      pk: `USER#${userId}`,
      sk: `DEVICE#${deviceId}`
    }
  }));

  return result.Item ? toDeviceRecord(result.Item) : null;
}

export async function listDevicesByUser(userId: string): Promise<DeviceRecord[]> {
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`
    }
  }));

  return (result.Items || []).map((item: Record<string, unknown>) => toDeviceRecord(item));
}

export async function updateDeviceStatus(userId: string, deviceId: string, status: DeviceStatus): Promise<DeviceRecord> {
  const now = new Date().toISOString();
  let updateExpr = "SET #status = :val, lastSeenAt = :now";
  let exprNames: Record<string, string> = { "#status": "status" };
  let exprValues: Record<string, unknown> = {
    ":val": status,
    ":now": now
  };

  if (status === DeviceStatus.REVOKED) {
    updateExpr += ", revokedAt = :now";
  }

  const result = await ddbDocClient.send(new UpdateCommand({
    TableName: getTableName(),
    Key: {
      pk: `USER#${userId}`,
      sk: `DEVICE#${deviceId}`
    },
    UpdateExpression: updateExpr,
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: exprValues,
    ReturnValues: "ALL_NEW"
  }));

  if (!result.Attributes) {
    throw new Error(`Device not found after update: ${deviceId}`);
  }
  return toDeviceRecord(result.Attributes as Record<string, unknown>);
}
