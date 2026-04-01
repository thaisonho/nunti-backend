/**
 * WebSocket relay publisher for direct-message delivery events.
 *
 * Handles live relay to recipient devices and sender-facing delivery
 * status notifications. Follows the same PostToConnectionCommand +
 * GoneException cleanup pattern as trust-change-publisher.
 */

import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import * as ConnectionRegistry from './connection-registry.js';
import type { DirectMessageEvent, DeliveryState, DeliveryStatusEvent } from '../messages/message-model.js';

function getManagementEndpoint(): string | null {
  return process.env.WEBSOCKET_MANAGEMENT_ENDPOINT ?? null;
}

/**
 * Relay an encrypted direct message to the recipient device.
 *
 * @returns The delivery outcome:
 *   - 'delivered' if at least one connection received the message
 *   - 'accepted-queued' if no active connections for the device
 */
export async function relayDirectMessage(
  recipientUserId: string,
  recipientDeviceId: string,
  event: DirectMessageEvent,
): Promise<DeliveryState> {
  const endpoint = getManagementEndpoint();
  if (!endpoint) {
    // No WebSocket endpoint configured — queue for later
    return 'accepted-queued';
  }

  const connections = await ConnectionRegistry.listDeviceConnections(
    recipientUserId,
    recipientDeviceId,
  );

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
        await ConnectionRegistry.removeConnection(recipientUserId, connection.connectionId);
        return;
      }

      console.warn('direct-message relay failed', {
        recipientUserId,
        recipientDeviceId,
        connectionId: connection.connectionId,
        errorName: (error as { name?: string }).name ?? 'UnknownError',
      });
    }
  }));

  return delivered ? 'delivered' : 'accepted-queued';
}

/**
 * Publish a delivery status event to the sender device.
 * Sender receives accepted, delivered, or failed states as separate events.
 */
export async function publishDeliveryStatus(
  senderUserId: string,
  senderDeviceId: string,
  messageId: string,
  status: DeliveryState,
): Promise<void> {
  const endpoint = getManagementEndpoint();
  if (!endpoint) {
    return;
  }

  const connections = await ConnectionRegistry.listDeviceConnections(
    senderUserId,
    senderDeviceId,
  );

  if (connections.length === 0) {
    return;
  }

  const client = new ApiGatewayManagementApiClient({ endpoint });
  const event: DeliveryStatusEvent = {
    eventType: 'delivery-status',
    messageId,
    status,
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
        await ConnectionRegistry.removeConnection(senderUserId, connection.connectionId);
        return;
      }

      console.warn('delivery-status publish failed', {
        senderUserId,
        senderDeviceId,
        connectionId: connection.connectionId,
        errorName: (error as { name?: string }).name ?? 'UnknownError',
      });
    }
  }));
}
