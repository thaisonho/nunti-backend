import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DeviceRecord, DeviceStatus } from "./device-model.js";

const client = new DynamoDBClient({});
export const ddbDocClient = DynamoDBDocumentClient.from(client);

interface UpsertParams {
  userId: string;
  deviceId: string;
  deviceLabel?: string;
  platform?: string;
  appVersion?: string;
}

const TableName = process.env.DEVICES_TABLE_NAME || "nunti-devices";

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
    TableName,
    Item: {
      pk: `USER#${params.userId}`,
      sk: `DEVICE#${params.deviceId}`,
      ...record
    }
  }));

  return record;
}

export async function getDevice(userId: string, deviceId: string): Promise<DeviceRecord | null> {
  const result = await ddbDocClient.send(new GetCommand({
    TableName,
    Key: {
      pk: `USER#${userId}`,
      sk: `DEVICE#${deviceId}`
    }
  }));

  return result.Item ? (result.Item as DeviceRecord) : null;
}

export async function listDevicesByUser(userId: string): Promise<DeviceRecord[]> {
  const result = await ddbDocClient.send(new QueryCommand({
    TableName,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`
    }
  }));

  return (result.Items || []) as DeviceRecord[];
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
    TableName,
    Key: {
      pk: `USER#${userId}`,
      sk: `DEVICE#${deviceId}`
    },
    UpdateExpression: updateExpr,
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: exprValues,
    ReturnValues: "ALL_NEW"
  }));

  return result.Attributes as DeviceRecord;
}
