import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import * as ConnectionRegistry from './connection-registry.js';
import { buildRedactedMeta } from './log-redact.js';

export interface TrustChangeEvent {
  changeType: 'device-registered' | 'device-revoked' | 'keys-updated';
  deviceId: string;
  timestamp: string;
}

function getManagementEndpoint(): string | null {
  return process.env.WEBSOCKET_MANAGEMENT_ENDPOINT ?? null;
}

export async function publishTrustChange(userId: string, event: TrustChangeEvent): Promise<void> {
  const endpoint = getManagementEndpoint();
  if (!endpoint) {
    return;
  }

  const connections = await ConnectionRegistry.listActiveConnections(userId);
  if (connections.length === 0) {
    return;
  }

  const client = new ApiGatewayManagementApiClient({ endpoint });
  const body = JSON.stringify({
    eventType: 'trust-change',
    changeType: event.changeType,
    deviceId: event.deviceId,
    timestamp: event.timestamp,
  });

  await Promise.all(connections.map(async (connection) => {
    try {
      await client.send(new PostToConnectionCommand({
        ConnectionId: connection.connectionId,
        Data: Buffer.from(body),
      }));
    } catch (error) {
      if ((error as { name?: string }).name === 'GoneException') {
        await ConnectionRegistry.removeConnection(userId, connection.connectionId);
        return;
      }

      console.warn('trust-change delivery failed', buildRedactedMeta({
        userId,
        connectionId: connection.connectionId,
        errorName: (error as { name?: string }).name ?? 'UnknownError',
        eventType: 'trust-change',
      }));
    }
  }));
}
