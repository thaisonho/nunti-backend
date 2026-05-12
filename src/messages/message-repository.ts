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

function conversationPk(userId: string): string {
  return `CONVO#${userId}`;
}

function conversationSk(otherUserId: string): string {
  return `USER#${otherUserId}`;
}

function threadPk(ownerUserId: string, otherUserId: string): string {
  return `THREAD#${ownerUserId}#${otherUserId}`;
}

function threadSk(serverTimestamp: string, messageId: string): string {
  return `${serverTimestamp}#${messageId}`;
}

function decodeCursor(cursor?: string): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
  } catch {
    return undefined;
  }
}

function encodeCursor(lastEvaluatedKey?: Record<string, unknown>): string | undefined {
  if (!lastEvaluatedKey) return undefined;
  return Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64');
}

/**
 * Create a new message record plus inbox and conversation history entries (idempotent).
 *
 * Uses a conditional write on the MSG record so that a retry with
 * the same messageId returns the stored outcome instead of creating
 * duplicates. If the messageId already exists, returns the existing
 * record and skips INBOX creation.
 *
 * @returns null for a new message, or the existing MessageRecord on duplicate
 */
export async function createMessage(
  record: MessageRecord,
  senderCiphertext?: string,
): Promise<MessageRecord | null> {
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

  await writeConversationEntries(record, senderCiphertext ?? record.ciphertext);

  return null;
}

async function writeConversationEntries(
  record: MessageRecord,
  senderCiphertext: string,
): Promise<void> {
  const senderItem = buildConversationMessageItem(
    record.senderUserId,
    record.recipientUserId,
    record,
    senderCiphertext,
    'outbound',
  );
  const recipientItem = buildConversationMessageItem(
    record.recipientUserId,
    record.senderUserId,
    record,
    record.ciphertext,
    'inbound',
  );

  await ddbDocClient.send(new PutCommand({
    TableName: getTableName(),
    Item: senderItem,
  }));

  await ddbDocClient.send(new PutCommand({
    TableName: getTableName(),
    Item: recipientItem,
  }));

  await upsertConversationSummary(
    record.senderUserId,
    record.recipientUserId,
    record,
    senderCiphertext,
  );

  await upsertConversationSummary(
    record.recipientUserId,
    record.senderUserId,
    record,
    record.ciphertext,
  );
}

function buildConversationMessageItem(
  ownerUserId: string,
  otherUserId: string,
  record: MessageRecord,
  ciphertext: string,
  direction: 'inbound' | 'outbound',
): Record<string, unknown> {
  return {
    pk: threadPk(ownerUserId, otherUserId),
    sk: threadSk(record.serverTimestamp, record.messageId),
    recordType: 'conversation-message',
    ownerUserId,
    otherUserId,
    direction,
    messageId: record.messageId,
    senderUserId: record.senderUserId,
    senderDeviceId: record.senderDeviceId,
    recipientUserId: record.recipientUserId,
    recipientDeviceId: record.recipientDeviceId,
    ciphertext,
    deliveryState: record.deliveryState,
    serverTimestamp: record.serverTimestamp,
    updatedAt: record.updatedAt,
  };
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

async function upsertConversationSummary(
  ownerUserId: string,
  otherUserId: string,
  record: MessageRecord,
  ciphertext: string,
): Promise<void> {
  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: getTableName(),
      Key: {
        pk: conversationPk(ownerUserId),
        sk: conversationSk(otherUserId),
      },
      UpdateExpression:
        'SET recordType = :recordType, userId = :otherUserId, ' +
        'lastMessageTimestamp = :ts, lastMessageId = :messageId, ' +
        'lastMessageCiphertext = :ciphertext, lastMessageSenderId = :senderUserId, ' +
        'unreadCount = :unreadCount, updatedAt = :updatedAt',
      ConditionExpression: 'attribute_not_exists(pk) OR lastMessageTimestamp < :ts',
      ExpressionAttributeValues: {
        ':recordType': 'conversation-summary',
        ':otherUserId': otherUserId,
        ':ts': record.serverTimestamp,
        ':messageId': record.messageId,
        ':ciphertext': ciphertext,
        ':senderUserId': record.senderUserId,
        ':unreadCount': 0,
        ':updatedAt': record.updatedAt,
      },
    }));
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return;
    }
    throw error;
  }
}

/**
 * Check if any messages exist between two users (in either direction).
 * Queries the inbox of the current user to see if they have any messages from the target user.
 * Note: This only checks one direction. For a complete check, you'd need to query both directions.
 */
export async function checkConversationExists(
  currentUserId: string,
  currentDeviceId: string,
  targetUserId: string,
): Promise<boolean> {
  const summary = await ddbDocClient.send(new GetCommand({
    TableName: getTableName(),
    Key: {
      pk: conversationPk(currentUserId),
      sk: conversationSk(targetUserId),
    },
  }));

  if (summary.Item) {
    return true;
  }

  // Query current user's inbox for messages from target user
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: 'pk = :pk',
    FilterExpression: 'senderUserId = :targetUserId',
    ExpressionAttributeValues: {
      ':pk': inboxPk(currentUserId, currentDeviceId),
      ':targetUserId': targetUserId,
    },
    Limit: 1, // We only need to know if at least one exists
  }));

  return (result.Items?.length ?? 0) > 0;
}

export interface ConversationSummary {
  userId: string;
  lastMessageTimestamp: string;
  lastMessageId: string;
  lastMessageCiphertext: string;
  lastMessageSenderId: string;
  unreadCount: number;
}

export type ConversationMessageOrder = 'asc' | 'desc';

export interface ConversationMessage {
  messageId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  recipientDeviceId: string;
  ciphertext: string;
  deliveryState: DeliveryState;
  serverTimestamp: string;
  direction: 'inbound' | 'outbound';
}

export interface PaginatedConversationMessages {
  messages: ConversationMessage[];
  nextCursor?: string;
}

/**
 * List all conversations for a user by querying their inbox.
 * Groups messages by conversation partner and returns the most recent message for each.
 */
export async function listConversations(
  userId: string,
  deviceId: string,
): Promise<ConversationSummary[]> {
  const summaryResult = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': conversationPk(userId),
    },
  }));

  const summaryItems = summaryResult.Items ?? [];
  if (summaryItems.length === 0) {
    return listConversationsFromInbox(userId, deviceId);
  }

  const conversationMap = new Map<string, ConversationSummary>();
  for (const item of summaryItems) {
    const summary = toConversationSummary(item as Record<string, unknown>);
    conversationMap.set(summary.userId, summary);
  }

  const inboxConversations = await listConversationsFromInbox(userId, deviceId);
  for (const convo of inboxConversations) {
    const existing = conversationMap.get(convo.userId);
    if (!existing || existing.lastMessageTimestamp < convo.lastMessageTimestamp) {
      conversationMap.set(convo.userId, convo);
    }
  }

  return Array.from(conversationMap.values()).sort(
    (a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp),
  );
}

async function listConversationsFromInbox(
  userId: string,
  deviceId: string,
): Promise<ConversationSummary[]> {
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': inboxPk(userId, deviceId),
    },
    ScanIndexForward: false, // newest first
  }));

  const items = result.Items ?? [];
  const conversationMap = new Map<string, ConversationSummary>();

  for (const item of items) {
    const senderUserId = item.senderUserId as string;

    if (!conversationMap.has(senderUserId)) {
      conversationMap.set(senderUserId, {
        userId: senderUserId,
        lastMessageTimestamp: item.serverTimestamp as string,
        lastMessageId: item.messageId as string,
        lastMessageCiphertext: item.ciphertext as string,
        lastMessageSenderId: senderUserId,
        unreadCount: 0,
      });
    }
  }

  return Array.from(conversationMap.values()).sort(
    (a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp),
  );
}

function toConversationSummary(item: Record<string, unknown>): ConversationSummary {
  return {
    userId: item.userId as string,
    lastMessageTimestamp: item.lastMessageTimestamp as string,
    lastMessageId: item.lastMessageId as string,
    lastMessageCiphertext: item.lastMessageCiphertext as string,
    lastMessageSenderId: item.lastMessageSenderId as string,
    unreadCount: Number(item.unreadCount ?? 0),
  };
}

export async function listConversationMessages(
  ownerUserId: string,
  otherUserId: string,
  options: {
    limit?: number;
    cursor?: string;
    order?: ConversationMessageOrder;
  } = {},
): Promise<PaginatedConversationMessages> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const order = options.order ?? 'desc';
  const cursor = decodeCursor(options.cursor);

  const result = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': threadPk(ownerUserId, otherUserId),
    },
    Limit: limit,
    ScanIndexForward: order === 'asc',
    ...(cursor && { ExclusiveStartKey: cursor }),
  }));

  return {
    messages: (result.Items ?? []).map((item) =>
      toConversationMessage(item as Record<string, unknown>),
    ),
    nextCursor: encodeCursor(result.LastEvaluatedKey as Record<string, unknown> | undefined),
  };
}

function toConversationMessage(item: Record<string, unknown>): ConversationMessage {
  return {
    messageId: item.messageId as string,
    senderUserId: item.senderUserId as string,
    senderDeviceId: item.senderDeviceId as string,
    recipientUserId: item.recipientUserId as string,
    recipientDeviceId: item.recipientDeviceId as string,
    ciphertext: item.ciphertext as string,
    deliveryState: item.deliveryState as DeliveryState,
    serverTimestamp: item.serverTimestamp as string,
    direction: item.direction as 'inbound' | 'outbound',
  };
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
