import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../devices/device-repository.js';
import { getConfig } from '../app/config.js';

/** Backward-compatible active connection record (used by trust-change fanout). */
export interface ActiveConnection {
  userId: string;
  connectionId: string;
}

/** Device-aware connection record for targeted message delivery. */
export interface DeviceConnection extends ActiveConnection {
  deviceId: string;
}

function getTableName(): string {
  return getConfig().devicesTableName;
}

function connectionsPk(userId: string): string {
  return `CONNECTIONS#${userId}`;
}

function connectionSk(connectionId: string): string {
  return `CONNECTION#${connectionId}`;
}

function parseConnectionId(item: Record<string, unknown>): string | null {
  if (typeof item.connectionId === 'string' && item.connectionId.length > 0) {
    return item.connectionId;
  }

  if (typeof item.sk === 'string' && item.sk.startsWith('CONNECTION#')) {
    const derived = item.sk.slice('CONNECTION#'.length);
    return derived.length > 0 ? derived : null;
  }

  return null;
}

function parseDeviceId(item: Record<string, unknown>): string | null {
  if (typeof item.deviceId === 'string' && item.deviceId.length > 0) {
    return item.deviceId;
  }
  return null;
}

/**
 * Register an authenticated device connection.
 * Stores userId, deviceId, and connectionId so the registry can
 * support both same-account trust fanout and device-targeted message delivery.
 */
export async function putConnection(
  userId: string,
  deviceId: string,
  connectionId: string,
): Promise<void> {
  await ddbDocClient.send(new PutCommand({
    TableName: getTableName(),
    Item: {
      pk: connectionsPk(userId),
      sk: connectionSk(connectionId),
      userId,
      deviceId,
      connectionId,
      connectedAt: new Date().toISOString(),
    },
  }));
}

/**
 * List all active connections for a user.
 * Returns the backward-compatible ActiveConnection shape used by
 * trust-change-publisher for same-account fanout.
 */
export async function listActiveConnections(userId: string): Promise<ActiveConnection[]> {
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: {
      ':pk': connectionsPk(userId),
      ':sk': 'CONNECTION#',
    },
  }));

  return (result.Items ?? [])
    .map((item) => {
      const connectionId = parseConnectionId(item as Record<string, unknown>);
      if (!connectionId) {
        return null;
      }

      return {
        userId,
        connectionId,
      };
    })
    .filter((item): item is ActiveConnection => item !== null);
}

/**
 * List active connections for a specific device.
 * Queries all user connections and filters by deviceId.
 * Used for device-targeted direct-message delivery.
 */
export async function listDeviceConnections(
  userId: string,
  deviceId: string,
): Promise<DeviceConnection[]> {
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: {
      ':pk': connectionsPk(userId),
      ':sk': 'CONNECTION#',
    },
  }));

  return (result.Items ?? [])
    .map((item) => {
      const raw = item as Record<string, unknown>;
      const connId = parseConnectionId(raw);
      const devId = parseDeviceId(raw);
      if (!connId || !devId) {
        return null;
      }

      return {
        userId,
        deviceId: devId,
        connectionId: connId,
      };
    })
    .filter((item): item is DeviceConnection => item !== null && item.deviceId === deviceId);
}

/**
 * Remove a connection record.
 * Called on disconnect or when a GoneException indicates a stale connection.
 */
export async function removeConnection(userId: string, connectionId: string): Promise<void> {
  await ddbDocClient.send(new DeleteCommand({
    TableName: getTableName(),
    Key: {
      pk: connectionsPk(userId),
      sk: connectionSk(connectionId),
    },
  }));
}
