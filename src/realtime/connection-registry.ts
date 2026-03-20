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

export async function listActiveConnections(userId: string): Promise<ActiveConnection[]> {
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: {
      ':pk': connectionsPk(userId),
      ':sk': 'CONNECTION#',
    },
  }));

  return (result.Items ?? []).map((item) => ({
    userId,
    connectionId: String(item.connectionId),
  }));
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
