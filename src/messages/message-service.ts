/**
 * Direct-message send orchestration (idempotent + retention-aware).
 *
 * Coordinates between message repository (persistence), connection registry
 * (recipient lookup), and message relay publisher (live delivery).
 *
 * Delivery outcomes:
 *   accepted  → stored + relay attempted (initial state)
 *   delivered → relay succeeded to at least one recipient device connection
 *   accepted-queued → recipient device has no active connections
 *   failed    → retention policy expired for queued message
 *
 * Idempotency:
 *   A retry with the same messageId returns the prior outcome without
 *   creating duplicate queue items or duplicate relay side effects.
 */

import type { WebSocketConnectionContext } from '../auth/websocket-auth.js';
import type {
  DirectMessageRequest,
  DirectMessageEvent,
  MessageRecord,
  SendMessageResult,
} from './message-model.js';
import * as MessageRepository from './message-repository.js';
import * as MessageRelayPublisher from '../realtime/message-relay-publisher.js';

/** Maximum age (in milliseconds) for queued messages before they become terminal failures. */
const RETENTION_POLICY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Process a direct-message send request (idempotent).
 *
 * If the messageId already exists, returns the stored outcome without
 * creating duplicate side effects. For new messages:
 * 1. Persist with conditional write (idempotency key = messageId)
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

  // Persist the message (idempotent — returns existing record on duplicate)
  const existingRecord = await MessageRepository.createMessage(record);

  if (existingRecord) {
    // Duplicate send — return the stored outcome without side effects
    return {
      messageId: existingRecord.messageId,
      status: existingRecord.deliveryState,
      serverTimestamp: existingRecord.serverTimestamp,
    };
  }

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

/**
 * Check a queued message against the retention policy.
 * If the message has exceeded the retention window, transitions it
 * to a terminal 'failed' state and notifies the sender.
 *
 * @returns true if the message was expired, false if still within retention
 */
export async function checkRetentionPolicy(
  record: MessageRecord,
): Promise<boolean> {
  if (record.deliveryState !== 'accepted-queued') {
    return false;
  }

  const enqueuedAt = new Date(record.serverTimestamp).getTime();
  const now = Date.now();

  if (now - enqueuedAt < RETENTION_POLICY_MS) {
    return false;
  }

  // Transition to terminal failed state
  await MessageRepository.updateDeliveryState(record, 'failed');

  // Notify the sender of the failure
  await MessageRelayPublisher.publishDeliveryStatus(
    record.senderUserId,
    record.senderDeviceId,
    record.messageId,
    'failed',
  );

  return true;
}
