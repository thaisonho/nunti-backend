import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { DeviceRecord, DeviceStatus, IdentityKeyRecord, SignedPreKeyRecord, OneTimePreKeyRecord } from "./device-model.js";
import { AppError } from "../app/errors.js";
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

interface UpdateDeviceKeysParams {
  userId: string;
  deviceId: string;
  identityKey: IdentityKeyRecord;
  signedPreKey: SignedPreKeyRecord;
}

function getTableName(): string {
  return getConfig().devicesTableName;
}

function devicePk(userId: string): string {
  return `USER#${userId}`;
}

function deviceSk(deviceId: string): string {
  return `DEVICE#${deviceId}`;
}

function oneTimePreKeyPrefix(deviceId: string): string {
  return `OPK#DEVICE#${deviceId}#`;
}

function legacyOneTimePreKeyPrefix(deviceId: string): string {
  return `${deviceSk(deviceId)}#OPK#`;
}

function oneTimePreKeySk(deviceId: string, keyId: string): string {
  return `${oneTimePreKeyPrefix(deviceId)}${keyId}`;
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
      pk: devicePk(params.userId),
      sk: deviceSk(params.deviceId),
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
    ...(item.keyStateUpdatedAt !== undefined && { keyStateUpdatedAt: item.keyStateUpdatedAt as string }),
    ...(item.identityKey !== undefined && { identityKey: item.identityKey as IdentityKeyRecord }),
    ...(item.signedPreKey !== undefined && { signedPreKey: item.signedPreKey as SignedPreKeyRecord }),
  };
}

export async function getDevice(userId: string, deviceId: string): Promise<DeviceRecord | null> {
  const result = await ddbDocClient.send(new GetCommand({
    TableName: getTableName(),
    Key: {
      pk: devicePk(userId),
      sk: deviceSk(deviceId)
    }
  }));

  return result.Item ? toDeviceRecord(result.Item) : null;
}

export async function listDevicesByUser(userId: string): Promise<DeviceRecord[]> {
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
    ExpressionAttributeValues: {
      ":pk": devicePk(userId),
      ":sk": "DEVICE#"
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
      pk: devicePk(userId),
      sk: deviceSk(deviceId)
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

export async function updateDeviceKeys(params: UpdateDeviceKeysParams): Promise<DeviceRecord> {
  const now = new Date().toISOString();
  const result = await ddbDocClient.send(new UpdateCommand({
    TableName: getTableName(),
    Key: {
      pk: devicePk(params.userId),
      sk: deviceSk(params.deviceId)
    },
    ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
    UpdateExpression: "SET identityKey = :identityKey, signedPreKey = :signedPreKey, keyStateUpdatedAt = :updatedAt, lastSeenAt = :updatedAt",
    ExpressionAttributeValues: {
      ":identityKey": params.identityKey,
      ":signedPreKey": params.signedPreKey,
      ":updatedAt": now,
    },
    ReturnValues: "ALL_NEW"
  }));

  if (!result.Attributes) {
    throw new Error(`Device not found after key update: ${params.deviceId}`);
  }

  return toDeviceRecord(result.Attributes as Record<string, unknown>);
}

export async function replaceOneTimePreKeys(userId: string, deviceId: string, preKeys: OneTimePreKeyRecord[]): Promise<void> {
  const prefixes = [oneTimePreKeyPrefix(deviceId), legacyOneTimePreKeyPrefix(deviceId)];

  for (const prefix of prefixes) {
    const existing = await ddbDocClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": devicePk(userId),
        ":prefix": prefix,
      },
    }));

    for (const item of existing.Items ?? []) {
      await ddbDocClient.send(new DeleteCommand({
        TableName: getTableName(),
        Key: {
          pk: item.pk,
          sk: item.sk,
        },
      }));
    }
  }

  for (const preKey of preKeys) {
    try {
      await ddbDocClient.send(new PutCommand({
        TableName: getTableName(),
        Item: {
          pk: devicePk(userId),
          sk: oneTimePreKeySk(deviceId, preKey.keyId),
          userId,
          deviceId,
          ...preKey,
        },
        ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      }));
    } catch (error) {
      if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
        throw new AppError("CONFLICT", "Duplicate one-time prekey keyId in replacement payload", 409);
      }
      throw error;
    }
  }
}

export async function consumeOneTimePreKey(userId: string, deviceId: string): Promise<OneTimePreKeyRecord> {
  const prefixes = [oneTimePreKeyPrefix(deviceId), legacyOneTimePreKeyPrefix(deviceId)];
  let candidates: Record<string, unknown>[] = [];

  for (const prefix of prefixes) {
    const queryResult = await ddbDocClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": devicePk(userId),
        ":prefix": prefix,
      },
      Limit: 25,
    }));

    candidates = queryResult.Items ?? [];
    if (candidates.length > 0) {
      break;
    }
  }

  if (candidates.length === 0) {
    throw new AppError("CONFLICT", "No one-time prekeys available", 409);
  }

  for (const item of candidates) {
    try {
      await ddbDocClient.send(new DeleteCommand({
        TableName: getTableName(),
        Key: {
          pk: item.pk,
          sk: item.sk,
        },
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
      }));

      return {
        keyId: item.keyId as string,
        algorithm: item.algorithm as string,
        publicKey: item.publicKey as string,
      };
    } catch (error) {
      if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
        continue;
      }
      throw error;
    }
  }

  throw new AppError("CONFLICT", "No one-time prekeys available", 409);
}
