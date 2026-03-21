import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../devices/device-repository.js';
import { getConfig } from '../app/config.js';

export interface ActiveConnection {
  userId: string;
  connectionId: string;
}

function getTableName(): string {
  return getConfig().devicesTableName;
}

function connectionsPk(userId: string): string {
  return `CONNECTIONS#${userId}`;
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

export async function removeConnection(userId: string, connectionId: string): Promise<void> {
  await ddbDocClient.send(new DeleteCommand({
    TableName: getTableName(),
    Key: {
      pk: connectionsPk(userId),
      sk: `CONNECTION#${connectionId}`,
    },
  }));
}
