import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import * as ConnectionRegistry from './connection-registry.js';
import type { DeliveryState } from '../messages/message-model.js';
import type {
  GroupMembershipEvent,
  GroupReplayCompleteEvent,
  GroupMessageEvent,
  GroupDeviceStatusEvent,
  GroupDeviceOutcome,
} from '../messages/group-message-model.js';

function getManagementEndpoint(): string | null {
  return process.env.WEBSOCKET_MANAGEMENT_ENDPOINT ?? null;
}

export async function publishMembershipEvent(
  userId: string,
  deviceId: string,
  event: GroupMembershipEvent,
): Promise<DeliveryState> {
  const endpoint = getManagementEndpoint();
  if (!endpoint) {
    return 'accepted-queued';
  }

  const connections = await ConnectionRegistry.listDeviceConnections(userId, deviceId);
  if (connections.length === 0) {
    return 'accepted-queued';
  }

  const client = new ApiGatewayManagementApiClient({ endpoint });
  const body = JSON.stringify(event);
  let delivered = false;

  await Promise.all(connections.map(async (connection) => {
    try {
      await client.send(new PostToConnectionCommand({
        ConnectionId: connection.connectionId,
        Data: Buffer.from(body),
      }));
      delivered = true;
    } catch (error) {
      if ((error as { name?: string }).name === 'GoneException') {
        await ConnectionRegistry.removeConnection(userId, connection.connectionId);
        return;
      }

      console.warn('group-membership relay failed', {
        userId,
        deviceId,
        connectionId: connection.connectionId,
        errorName: (error as { name?: string }).name ?? 'UnknownError',
      });
    }
  }));

  return delivered ? 'delivered' : 'accepted-queued';
}

export async function publishMembershipReplayComplete(
  userId: string,
  deviceId: string,
  eventsReplayed: number,
): Promise<void> {
  const endpoint = getManagementEndpoint();
  if (!endpoint) {
    return;
  }

  const connections = await ConnectionRegistry.listDeviceConnections(userId, deviceId);
  if (connections.length === 0) {
    return;
  }

  const client = new ApiGatewayManagementApiClient({ endpoint });
  const event: GroupReplayCompleteEvent = {
    eventType: 'group-replay-complete',
    deviceId,
    eventsReplayed,
    serverTimestamp: new Date().toISOString(),
  };
  const body = JSON.stringify(event);

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

      console.warn('group replay-complete publish failed', {
        userId,
        deviceId,
        connectionId: connection.connectionId,
        errorName: (error as { name?: string }).name ?? 'UnknownError',
      });
    }
  }));
}

// ============================================================================
// Group Message Publishing
// ============================================================================

export async function publishGroupMessage(
  userId: string,
  deviceId: string,
  event: GroupMessageEvent,
): Promise<GroupDeviceOutcome> {
  const endpoint = getManagementEndpoint();
  if (!endpoint) {
    return 'accepted-queued';
  }

  const connections = await ConnectionRegistry.listDeviceConnections(userId, deviceId);
  if (connections.length === 0) {
    return 'accepted-queued';
  }

  const client = new ApiGatewayManagementApiClient({ endpoint });
  const body = JSON.stringify(event);
  let delivered = false;

  await Promise.all(connections.map(async (connection) => {
    try {
      await client.send(new PostToConnectionCommand({
        ConnectionId: connection.connectionId,
        Data: Buffer.from(body),
      }));
      delivered = true;
    } catch (error) {
      if ((error as { name?: string }).name === 'GoneException') {
        await ConnectionRegistry.removeConnection(userId, connection.connectionId);
        return;
      }

      console.warn('group-message relay failed', {
        userId,
        deviceId,
        connectionId: connection.connectionId,
        errorName: (error as { name?: string }).name ?? 'UnknownError',
      });
    }
  }));

  return delivered ? 'delivered' : 'accepted-queued';
}

export async function publishGroupDeviceStatus(
  userId: string,
  deviceId: string,
  event: GroupDeviceStatusEvent,
): Promise<void> {
  const endpoint = getManagementEndpoint();
  if (!endpoint) {
    return;
  }

  const connections = await ConnectionRegistry.listDeviceConnections(userId, deviceId);
  if (connections.length === 0) {
    return;
  }

  const client = new ApiGatewayManagementApiClient({ endpoint });
  const body = JSON.stringify(event);

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

      console.warn('group-device-status publish failed', {
        userId,
        deviceId,
        connectionId: connection.connectionId,
        errorName: (error as { name?: string }).name ?? 'UnknownError',
      });
    }
  }));
}

export async function publishGroupMessageReplayComplete(
  userId: string,
  deviceId: string,
  messagesReplayed: number,
): Promise<void> {
  const endpoint = getManagementEndpoint();
  if (!endpoint) {
    return;
  }

  const connections = await ConnectionRegistry.listDeviceConnections(userId, deviceId);
  if (connections.length === 0) {
    return;
  }

  const client = new ApiGatewayManagementApiClient({ endpoint });
  const event = {
    eventType: 'group-message-replay-complete',
    deviceId,
    messagesReplayed,
    serverTimestamp: new Date().toISOString(),
  };
  const body = JSON.stringify(event);

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

      console.warn('group-message-replay-complete publish failed', {
        userId,
        deviceId,
        connectionId: connection.connectionId,
        errorName: (error as { name?: string }).name ?? 'UnknownError',
      });
    }
  }));
}
