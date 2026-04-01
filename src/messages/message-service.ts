/**
 * Direct-message send orchestration.
 *
 * Coordinates between message repository (persistence), connection registry
 * (recipient lookup), and message relay publisher (live delivery).
 *
 * Delivery outcomes:
 *   accepted  → stored + relay attempted (initial state)
 *   delivered → relay succeeded to at least one recipient device connection
 *   accepted-queued → recipient device has no active connections
 */

import type { WebSocketConnectionContext } from '../auth/websocket-auth.js';
import type {
  DirectMessageRequest,
  DirectMessageEvent,
  MessageRecord,
  SendMessageResult,
  DeliveryState,
} from './message-model.js';
import * as MessageRepository from './message-repository.js';
import * as MessageRelayPublisher from '../realtime/message-relay-publisher.js';

/**
 * Process a direct-message send request.
 *
 * 1. Persist the message with initial 'accepted' state
 * 2. Attempt live relay to recipient device
 * 3. Update state to 'delivered' or 'accepted-queued'
 * 4. Notify sender of the delivery outcome
 */
export async function sendMessage(
  context: WebSocketConnectionContext,
  request: DirectMessageRequest,
): Promise<SendMessageResult> {
  const serverTimestamp = new Date().toISOString();

  // Build the message record
  const record: MessageRecord = {
    messageId: request.messageId,
    senderUserId: context.userId,
    senderDeviceId: context.deviceId,
    recipientUserId: request.recipientUserId,
    recipientDeviceId: request.recipientDeviceId,
    ciphertext: request.ciphertext,
    deliveryState: 'accepted',
    serverTimestamp,
    updatedAt: serverTimestamp,
  };

  // Persist the message
  await MessageRepository.createMessage(record);

  // Build the relay event for the recipient
  const relayEvent: DirectMessageEvent = {
    eventType: 'direct-message',
    messageId: request.messageId,
    senderUserId: context.userId,
    senderDeviceId: context.deviceId,
    recipientUserId: request.recipientUserId,
    recipientDeviceId: request.recipientDeviceId,
    ciphertext: request.ciphertext,
    serverTimestamp,
  };

  // Attempt live delivery
  const deliveryOutcome = await MessageRelayPublisher.relayDirectMessage(
    request.recipientUserId,
    request.recipientDeviceId,
    relayEvent,
  );

  // Update delivery state if changed from initial 'accepted'
  if (deliveryOutcome !== 'accepted') {
    await MessageRepository.updateDeliveryState(record, deliveryOutcome);
  }

  // Notify the sender of the delivery outcome
  await MessageRelayPublisher.publishDeliveryStatus(
    context.userId,
    context.deviceId,
    request.messageId,
    deliveryOutcome,
  );

  return {
    messageId: request.messageId,
    status: deliveryOutcome,
    serverTimestamp,
  };
}
