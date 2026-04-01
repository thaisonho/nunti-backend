/**
 * Message persistence layer for 1:1 encrypted direct messages.
 *
 * DynamoDB schema (messages table):
 *   Message record:  pk=MSG#{messageId}   sk=MSG#{messageId}
 *   Inbox record:    pk=INBOX#{recipientUserId}#{recipientDeviceId}  sk={serverTimestamp}#{messageId}
 *
 * The inbox record enables oldest-first queued-message queries for reconnect replay (Wave 3).
 */

import { PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../devices/device-repository.js';
import { getConfig } from '../app/config.js';
import type { MessageRecord, DeliveryState } from './message-model.js';

function getTableName(): string {
  return getConfig().messagesTableName;
}

function messagePk(messageId: string): string {
  return `MSG#${messageId}`;
}

function inboxPk(recipientUserId: string, recipientDeviceId: string): string {
  return `INBOX#${recipientUserId}#${recipientDeviceId}`;
}

function inboxSk(serverTimestamp: string, messageId: string): string {
  return `${serverTimestamp}#${messageId}`;
}

/**
 * Create a new message record and its inbox entry (idempotent).
 *
 * Uses a conditional write on the MSG record so that a retry with
 * the same messageId returns the stored outcome instead of creating
 * duplicates. If the messageId already exists, returns the existing
 * record and skips INBOX creation.
 *
 * @returns null for a new message, or the existing MessageRecord on duplicate
 */
export async function createMessage(record: MessageRecord): Promise<MessageRecord | null> {
  try {
    // Store the canonical message record with conditional write
    await ddbDocClient.send(new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: messagePk(record.messageId),
        sk: messagePk(record.messageId),
        ...record,
      },
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
    }));
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      // Duplicate messageId — return the existing record
      return getMessage(record.messageId);
    }
    throw error;
  }

  // Store the inbox entry for recipient device queries (only for new messages)
  await ddbDocClient.send(new PutCommand({
    TableName: getTableName(),
    Item: {
      pk: inboxPk(record.recipientUserId, record.recipientDeviceId),
      sk: inboxSk(record.serverTimestamp, record.messageId),
      messageId: record.messageId,
      senderUserId: record.senderUserId,
      senderDeviceId: record.senderDeviceId,
      recipientUserId: record.recipientUserId,
      recipientDeviceId: record.recipientDeviceId,
      ciphertext: record.ciphertext,
      deliveryState: record.deliveryState,
      serverTimestamp: record.serverTimestamp,
    },
  }));

  return null;
}

/**
 * Retrieve a message record by messageId.
 */
export async function getMessage(messageId: string): Promise<MessageRecord | null> {
  const result = await ddbDocClient.send(new GetCommand({
    TableName: getTableName(),
    Key: {
      pk: messagePk(messageId),
      sk: messagePk(messageId),
    },
    ConsistentRead: true,
  }));

  if (!result.Item) {
    return null;
  }

  return toMessageRecord(result.Item as Record<string, unknown>);
}

/**
 * Update the delivery state of a message.
 * Updates both the canonical message record and the inbox entry.
 */
export async function updateDeliveryState(
  record: MessageRecord,
  newState: DeliveryState,
): Promise<void> {
  const now = new Date().toISOString();

  // Update canonical message record
  await ddbDocClient.send(new UpdateCommand({
    TableName: getTableName(),
    Key: {
      pk: messagePk(record.messageId),
      sk: messagePk(record.messageId),
    },
    UpdateExpression: 'SET deliveryState = :state, updatedAt = :now',
    ExpressionAttributeValues: {
      ':state': newState,
      ':now': now,
    },
  }));

  // Update inbox entry
  await ddbDocClient.send(new UpdateCommand({
    TableName: getTableName(),
    Key: {
      pk: inboxPk(record.recipientUserId, record.recipientDeviceId),
      sk: inboxSk(record.serverTimestamp, record.messageId),
    },
    UpdateExpression: 'SET deliveryState = :state',
    ExpressionAttributeValues: {
      ':state': newState,
    },
  }));
}

/**
 * Query queued messages for a recipient device in oldest-first order.
 * Used by reconnect replay (Wave 3).
 */
export async function listQueuedMessages(
  recipientUserId: string,
  recipientDeviceId: string,
): Promise<MessageRecord[]> {
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: 'pk = :pk',
    FilterExpression: 'deliveryState = :state',
    ExpressionAttributeValues: {
      ':pk': inboxPk(recipientUserId, recipientDeviceId),
      ':state': 'accepted-queued',
    },
    ScanIndexForward: true, // oldest first
  }));

  return (result.Items ?? []).map((item) =>
    toMessageRecord(item as Record<string, unknown>),
  );
}

function toMessageRecord(item: Record<string, unknown>): MessageRecord {
  const pk = item.pk as string | undefined;
  const sk = item.sk as string | undefined;

  let recipientUserId = item.recipientUserId as string | undefined;
  let recipientDeviceId = item.recipientDeviceId as string | undefined;

  if ((!recipientUserId || !recipientDeviceId) && pk && pk.startsWith('INBOX#')) {
    const parts = pk.split('#');
    if (parts.length >= 3) {
      recipientUserId = recipientUserId ?? parts[1];
      recipientDeviceId = recipientDeviceId ?? parts[2];
    }
  }

  let serverTimestamp = item.serverTimestamp as string | undefined;
  if (!serverTimestamp && sk) {
    const [timestampPart] = sk.split('#');
    if (timestampPart) {
      serverTimestamp = timestampPart;
    }
  }

  return {
    messageId: item.messageId as string,
    senderUserId: item.senderUserId as string,
    senderDeviceId: item.senderDeviceId as string,
    recipientUserId: recipientUserId as string,
    recipientDeviceId: recipientDeviceId as string,
    ciphertext: item.ciphertext as string,
    deliveryState: item.deliveryState as DeliveryState,
    serverTimestamp: serverTimestamp as string,
    updatedAt: (item.updatedAt as string) ?? (serverTimestamp as string),
  };
}
