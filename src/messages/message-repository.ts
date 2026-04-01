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
 * Create a new message record and its inbox entry.
 * First-pass: no conditional write (idempotency added in Wave 2).
 */
export async function createMessage(record: MessageRecord): Promise<void> {
  // Store the canonical message record
  await ddbDocClient.send(new PutCommand({
    TableName: getTableName(),
    Item: {
      pk: messagePk(record.messageId),
      sk: messagePk(record.messageId),
      ...record,
    },
  }));

  // Store the inbox entry for recipient device queries
  await ddbDocClient.send(new PutCommand({
    TableName: getTableName(),
    Item: {
      pk: inboxPk(record.recipientUserId, record.recipientDeviceId),
      sk: inboxSk(record.serverTimestamp, record.messageId),
      messageId: record.messageId,
      senderUserId: record.senderUserId,
      senderDeviceId: record.senderDeviceId,
      ciphertext: record.ciphertext,
      deliveryState: record.deliveryState,
      serverTimestamp: record.serverTimestamp,
    },
  }));
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
  return {
    messageId: item.messageId as string,
    senderUserId: item.senderUserId as string,
    senderDeviceId: item.senderDeviceId as string,
    recipientUserId: item.recipientUserId as string,
    recipientDeviceId: item.recipientDeviceId as string,
    ciphertext: item.ciphertext as string,
    deliveryState: item.deliveryState as DeliveryState,
    serverTimestamp: item.serverTimestamp as string,
    updatedAt: (item.updatedAt as string) ?? (item.serverTimestamp as string),
  };
}
