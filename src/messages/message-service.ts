/**
 * Direct-message send orchestration (idempotent + retention-aware).
 *
 * Coordinates between message repository (persistence), connection registry
 * (recipient lookup), and message relay publisher (live delivery).
 *
 * Delivery outcomes:
 *   accepted  → immediate send-result after persistence + relay attempt
 *   delivered → async delivery-status after relay succeeds
 *   accepted-queued → async delivery-status when recipient is offline
 *   failed    → async delivery-status when retention policy expires
 *
 * Idempotency:
 *   A retry with the same messageId returns the prior outcome without
 *   creating duplicate queue items or duplicate relay side effects.
 */

import type { WebSocketConnectionContext } from '../auth/websocket-auth.js';
import type {
  DeviceCiphertext,
  DirectMessageRequest,
  DirectMessageEvent,
  MessageRecord,
  SendMessageResult,
} from './message-model.js';
import * as MessageRepository from './message-repository.js';
import * as MessageRelayPublisher from '../realtime/message-relay-publisher.js';
import * as DeviceRepository from '../devices/device-repository.js';
import { getUserById } from '../users/user-service.js';
import { DeviceStatus } from '../devices/device-model.js';
import { AppError } from '../app/errors.js';

/** Maximum age (in milliseconds) for queued messages before they become terminal failures. */
const RETENTION_POLICY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function displayNameFromEmail(email: string): string {
  return email.split('@')[0] || email;
}

async function getSenderProfileMetadata(senderUserId: string): Promise<Pick<DirectMessageEvent, 'senderEmail' | 'senderDisplayName'>> {
  const profile = await getUserById(senderUserId).catch((error) => {
    console.warn('Failed to hydrate direct-message sender profile', {
      userId: senderUserId,
      error: (error as Error).message,
    });
    return null;
  });

  if (!profile?.email) {
    return {};
  }

  return {
    senderEmail: profile.email,
    senderDisplayName: displayNameFromEmail(profile.email),
  };
}

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
  const recipientCiphertexts = getRecipientCiphertexts(request);
  const senderCiphertexts = getSenderCiphertexts(context, request);

  await assertRecipientDevicesCanReceive(
    request.recipientUserId,
    recipientCiphertexts.map((entry) => entry.deviceId),
  );
  await assertSenderDevicesCanStore(
    context.userId,
    senderCiphertexts.map((entry) => entry.deviceId),
  );

  const serverTimestamp = new Date().toISOString();

  // Build the message record
  const record: MessageRecord = {
    messageId: request.messageId,
    senderUserId: context.userId,
    senderDeviceId: context.deviceId,
    recipientUserId: request.recipientUserId,
    recipientDeviceId: request.recipientDeviceId,
    ciphertext: request.ciphertext,
    ...(request.senderCiphertext !== undefined && { senderCiphertext: request.senderCiphertext }),
    recipientCiphertexts,
    senderCiphertexts,
    deliveryState: 'accepted',
    serverTimestamp,
    updatedAt: serverTimestamp,
  };

  // Persist the message (idempotent — returns existing record on duplicate)
  const existingRecord = await MessageRepository.createMessage(record);

  if (existingRecord) {
    if (
      existingRecord.senderUserId !== context.userId ||
      existingRecord.senderDeviceId !== context.deviceId ||
      existingRecord.recipientUserId !== request.recipientUserId ||
      existingRecord.recipientDeviceId !== request.recipientDeviceId ||
      !sameDeviceCiphertexts(getRecipientCiphertextsFromRecord(existingRecord), recipientCiphertexts) ||
      !sameDeviceCiphertexts(getSenderCiphertextsFromRecord(existingRecord), senderCiphertexts)
    ) {
      throw new Error('messageId already exists with different message metadata');
    }

    if (existingRecord.deliveryState === 'accepted') {
      const deliveryOutcome = await relayStoredMessage(existingRecord);

      if (deliveryOutcome !== 'accepted') {
        await MessageRepository.updateDeliveryState(existingRecord, deliveryOutcome);
      }

      await MessageRelayPublisher.publishDeliveryStatus(
        context.userId,
        context.deviceId,
        existingRecord.messageId,
        deliveryOutcome,
      );

      return {
        messageId: existingRecord.messageId,
        status: 'accepted',
        serverTimestamp: existingRecord.serverTimestamp,
      };
    }

    // Duplicate send — return the stored outcome without side effects
    return {
      messageId: existingRecord.messageId,
      status: existingRecord.deliveryState,
      serverTimestamp: existingRecord.serverTimestamp,
    };
  }

  // Attempt live delivery
  const deliveryOutcome = await relayStoredMessage(record);

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
    status: 'accepted',
    serverTimestamp,
  };
}


function getRecipientCiphertexts(request: DirectMessageRequest): DeviceCiphertext[] {
  return request.recipientCiphertexts?.length
    ? request.recipientCiphertexts
    : [{ deviceId: request.recipientDeviceId, ciphertext: request.ciphertext }];
}

function getSenderCiphertexts(
  context: WebSocketConnectionContext,
  request: DirectMessageRequest,
): DeviceCiphertext[] {
  if (request.senderCiphertexts?.length) {
    return request.senderCiphertexts;
  }

  return [
    {
      deviceId: context.deviceId,
      ciphertext: request.senderCiphertext ?? request.ciphertext,
    },
  ];
}

function getRecipientCiphertextsFromRecord(record: MessageRecord): DeviceCiphertext[] {
  return record.recipientCiphertexts?.length
    ? record.recipientCiphertexts
    : [{ deviceId: record.recipientDeviceId, ciphertext: record.ciphertext }];
}

function getSenderCiphertextsFromRecord(record: MessageRecord): DeviceCiphertext[] {
  if (record.senderCiphertexts?.length) {
    return record.senderCiphertexts;
  }

  return [
    {
      deviceId: record.senderDeviceId,
      ciphertext: record.senderCiphertext ?? record.ciphertext,
    },
  ];
}

function sameDeviceCiphertexts(left: DeviceCiphertext[], right: DeviceCiphertext[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightByDeviceId = new Map(right.map((entry) => [entry.deviceId, entry.ciphertext]));
  return left.every((entry) => rightByDeviceId.get(entry.deviceId) === entry.ciphertext);
}

async function assertRecipientDevicesCanReceive(
  recipientUserId: string,
  recipientDeviceIds: string[],
): Promise<void> {
  for (const recipientDeviceId of recipientDeviceIds) {
    const recipientDevice = await DeviceRepository.getDevice(recipientUserId, recipientDeviceId);

    if (!recipientDevice) {
      throw new AppError(
        'DEVICE_NOT_FOUND',
        'Recipient device does not exist',
        404,
      );
    }

    if (recipientDevice.status !== DeviceStatus.TRUSTED) {
      throw new AppError(
        'AUTH_FORBIDDEN',
        'Recipient device is not trusted',
        403,
      );
    }

    if (!recipientDevice.identityKey || !recipientDevice.signedPreKey) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Recipient device has no usable key bundle',
        400,
      );
    }
  }
}

async function assertSenderDevicesCanStore(
  senderUserId: string,
  senderDeviceIds: string[],
): Promise<void> {
  for (const senderDeviceId of senderDeviceIds) {
    const senderDevice = await DeviceRepository.getDevice(senderUserId, senderDeviceId);

    if (!senderDevice || senderDevice.status !== DeviceStatus.TRUSTED) {
      throw new AppError(
        'AUTH_FORBIDDEN',
        'Sender history device is not trusted',
        403,
      );
    }
  }
}

async function relayStoredMessage(record: MessageRecord): Promise<SendMessageResult['status']> {
  const senderProfileMetadata = await getSenderProfileMetadata(record.senderUserId);
  const outcomes = await Promise.all(
    getRecipientCiphertextsFromRecord(record).map(async (entry) => {
      const relayEvent: DirectMessageEvent = {
        eventType: 'direct-message',
        messageId: record.messageId,
        senderUserId: record.senderUserId,
        ...senderProfileMetadata,
        senderDeviceId: record.senderDeviceId,
        recipientUserId: record.recipientUserId,
        recipientDeviceId: entry.deviceId,
        ciphertext: entry.ciphertext,
        serverTimestamp: record.serverTimestamp,
      };

      return MessageRelayPublisher.relayDirectMessage(
        record.recipientUserId,
        entry.deviceId,
        relayEvent,
      );
    }),
  );

  if (outcomes.every((outcome) => outcome === 'delivered')) {
    return 'delivered';
  }

  if (outcomes.some((outcome) => outcome === 'accepted-queued')) {
    return 'accepted-queued';
  }

  return 'accepted';
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

/**
 * Drain the accepted-queued backlog for a connected device.
 * Reads the inbox in server order, attempts relay for each message,
 * and emits a replay-complete boundary signal once finished.
 */
export async function replayBacklog(context: WebSocketConnectionContext): Promise<void> {
  // Query all queued messages for the device in oldest-first order
  const queuedMessages = await MessageRepository.listQueuedMessages(context.userId, context.deviceId);
  
  let replayedCount = 0;

  // Replay sequentially to maintain exact server order and predictability
  for (const record of queuedMessages) {
    const expired = await checkRetentionPolicy(record);

    if (expired) {
      continue;
    }

    const senderProfileMetadata = await getSenderProfileMetadata(record.senderUserId);
    const relayEvent: DirectMessageEvent = {
      eventType: 'direct-message',
      messageId: record.messageId,
      senderUserId: record.senderUserId,
      ...senderProfileMetadata,
      senderDeviceId: record.senderDeviceId,
      recipientUserId: record.recipientUserId,
      recipientDeviceId: record.recipientDeviceId,
      ciphertext: record.ciphertext,
      serverTimestamp: record.serverTimestamp,
    };

    // Attempt delivery using the live relay mechanics
    const deliveryOutcome = await MessageRelayPublisher.relayDirectMessage(
      record.recipientUserId,
      record.recipientDeviceId,
      relayEvent
    );

    if (deliveryOutcome === 'delivered') {
      // Mark as delivered to prevent future replays
      await MessageRepository.updateDeliveryState(record, 'delivered');

      // Notify the original sender that the message was finally delivered
      await MessageRelayPublisher.publishDeliveryStatus(
        record.senderUserId,
        record.senderDeviceId,
        record.messageId,
        'delivered'
      );
      
      replayedCount++;
    }
    // If delivery failed during replay (e.g. they disconnected concurrently),
    // we leave it queued and continue, relying on the next reconnect.
  }

  // Backlog fully drained (or relay attempted for all)
  // Signal replay-complete so the client can resume live traffic state
  await MessageRelayPublisher.publishReplayComplete(
    context.userId,
    context.deviceId,
    replayedCount
  );
}
