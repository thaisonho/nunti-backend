/**
 * Message persistence layer for 1:1 encrypted direct messages.
 *
 * DynamoDB schema (messages table):
 *   Message record:    pk=MSG#{messageId}                         sk=MSG#{messageId}
 *   Recipient inbox:   pk=INBOX#{recipientUserId}#{recipientDeviceId} sk={serverTimestamp}#{messageId}
 *   Sender outbox:     pk=OUTBOX#{senderUserId}#{senderDeviceId}      sk={serverTimestamp}#{messageId}
 *
 * INBOX powers reconnect replay and inbound history. OUTBOX stores a
 * sender-readable copy so the sending device can restore its own sent history.
 */

import { PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../devices/device-repository.js';
import { getConfig } from '../app/config.js';
import { AppError } from '../app/errors.js';
import type { MessageRecord, DeliveryState } from './message-model.js';

type ConversationDirection = 'inbound' | 'outbound';
type ConversationHistoryOrder = 'asc' | 'desc';

interface CursorPayload {
  sk: string;
  order: ConversationHistoryOrder;
}

interface InternalConversationMessage extends ConversationHistoryMessage {
  sortKey: string;
}

export interface ConversationSummary {
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  lastMessageTimestamp: string;
  lastMessageId: string;
  lastMessageCiphertext: string;
  lastMessageSenderId: string;
  lastMessageDirection: ConversationDirection;
  unreadCount: number;
}

export interface ConversationHistoryMessage {
  messageId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  recipientDeviceId: string;
  ciphertext: string;
  deliveryState: DeliveryState;
  serverTimestamp: string;
  direction: ConversationDirection;
}

export interface ListConversationMessagesOptions {
  limit?: number;
  cursor?: string;
  order?: ConversationHistoryOrder;
}

export interface ListConversationMessagesResult {
  messages: ConversationHistoryMessage[];
  nextCursor: string | null;
}

function getTableName(): string {
  return getConfig().messagesTableName;
}

function messagePk(messageId: string): string {
  return `MSG#${messageId}`;
}

function inboxPk(recipientUserId: string, recipientDeviceId: string): string {
  return `INBOX#${recipientUserId}#${recipientDeviceId}`;
}

function outboxPk(senderUserId: string, senderDeviceId: string): string {
  return `OUTBOX#${senderUserId}#${senderDeviceId}`;
}

function messageSk(serverTimestamp: string, messageId: string): string {
  return `${serverTimestamp}#${messageId}`;
}

/**
 * Create a new message record and its history/replay projections.
 *
 * The canonical MSG write is conditional. If a retry reuses the same messageId,
 * we read the stored record and idempotently ensure its projections exist.
 *
 * @returns null for a new message, or the existing MessageRecord on duplicate.
 */
export async function createMessage(record: MessageRecord): Promise<MessageRecord | null> {
  let existingRecord: MessageRecord | null = null;

  try {
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
    if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') {
      throw error;
    }

    existingRecord = await getMessage(record.messageId);
    if (!existingRecord) {
      throw error;
    }
  }

  await putMessageProjections(existingRecord ?? record);

  return existingRecord;
}

async function putMessageProjections(record: MessageRecord): Promise<void> {
  const sk = messageSk(record.serverTimestamp, record.messageId);
  const common = {
    messageId: record.messageId,
    senderUserId: record.senderUserId,
    senderDeviceId: record.senderDeviceId,
    recipientUserId: record.recipientUserId,
    recipientDeviceId: record.recipientDeviceId,
    deliveryState: record.deliveryState,
    serverTimestamp: record.serverTimestamp,
    updatedAt: record.updatedAt,
  };

  await Promise.all([
    ddbDocClient.send(new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: inboxPk(record.recipientUserId, record.recipientDeviceId),
        sk,
        ...common,
        ciphertext: record.ciphertext,
        direction: 'inbound',
        projectionType: 'inbox',
      },
    })),
    ddbDocClient.send(new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: outboxPk(record.senderUserId, record.senderDeviceId),
        sk,
        ...common,
        ciphertext: record.senderCiphertext ?? record.ciphertext,
        direction: 'outbound',
        projectionType: 'outbox',
      },
    })),
  ]);
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
 * Update delivery state on the canonical message and both history projections.
 */
export async function updateDeliveryState(
  record: MessageRecord,
  newState: DeliveryState,
): Promise<void> {
  const now = new Date().toISOString();
  const sk = messageSk(record.serverTimestamp, record.messageId);

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

  await Promise.all([
    updateProjectionDeliveryState(inboxPk(record.recipientUserId, record.recipientDeviceId), sk, newState, now),
    updateProjectionDeliveryState(outboxPk(record.senderUserId, record.senderDeviceId), sk, newState, now),
  ]);
}

async function updateProjectionDeliveryState(
  pk: string,
  sk: string,
  newState: DeliveryState,
  updatedAt: string,
): Promise<void> {
  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: getTableName(),
      Key: { pk, sk },
      ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
      UpdateExpression: 'SET deliveryState = :state, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':state': newState,
        ':updatedAt': updatedAt,
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
 * Query queued messages for a recipient device in oldest-first order.
 * Used by reconnect replay.
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
    ScanIndexForward: true,
  }));

  return (result.Items ?? []).map((item) =>
    toMessageRecord(item as Record<string, unknown>),
  );
}

/**
 * Check for any inbound or outbound message between the current device and a target user.
 */
export async function checkConversationExists(
  currentUserId: string,
  currentDeviceId: string,
  targetUserId: string,
): Promise<boolean> {
  const [hasInbound, hasOutbound] = await Promise.all([
    hasPartnerMessage(inboxPk(currentUserId, currentDeviceId), 'senderUserId', targetUserId),
    hasPartnerMessage(outboxPk(currentUserId, currentDeviceId), 'recipientUserId', targetUserId),
  ]);

  return hasInbound || hasOutbound;
}

async function hasPartnerMessage(
  pk: string,
  partnerAttribute: 'senderUserId' | 'recipientUserId',
  targetUserId: string,
): Promise<boolean> {
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'pk = :pk',
      FilterExpression: '#partner = :targetUserId',
      ExpressionAttributeNames: {
        '#partner': partnerAttribute,
      },
      ExpressionAttributeValues: {
        ':pk': pk,
        ':targetUserId': targetUserId,
      },
      Limit: 50,
      ExclusiveStartKey: exclusiveStartKey,
    }));

    if ((result.Items?.length ?? 0) > 0) {
      return true;
    }

    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return false;
}

/**
 * List all conversations for a device by merging inbound inbox and outbound outbox rows.
 */
export async function listConversations(
  userId: string,
  deviceId: string,
): Promise<ConversationSummary[]> {
  const [inboxItems, outboxItems] = await Promise.all([
    queryAllByPk(inboxPk(userId, deviceId)),
    queryAllByPk(outboxPk(userId, deviceId)),
  ]);

  const conversationMap = new Map<string, ConversationSummary>();

  for (const item of inboxItems) {
    const senderUserId = item.senderUserId as string | undefined;
    if (!senderUserId) {
      continue;
    }
    upsertConversationSummary(conversationMap, item, senderUserId, 'inbound');
  }

  for (const item of outboxItems) {
    const recipientUserId = item.recipientUserId as string | undefined;
    if (!recipientUserId) {
      continue;
    }
    upsertConversationSummary(conversationMap, item, recipientUserId, 'outbound');
  }

  return Array.from(conversationMap.values()).sort(
    (a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp),
  );
}

function upsertConversationSummary(
  conversationMap: Map<string, ConversationSummary>,
  item: Record<string, unknown>,
  partnerUserId: string,
  direction: ConversationDirection,
): void {
  const serverTimestamp = getServerTimestamp(item);
  const messageId = item.messageId as string | undefined;
  const ciphertext = item.ciphertext as string | undefined;
  const senderUserId = item.senderUserId as string | undefined;

  if (!serverTimestamp || !messageId || !ciphertext || !senderUserId) {
    return;
  }

  const existing = conversationMap.get(partnerUserId);
  if (existing && existing.lastMessageTimestamp >= serverTimestamp) {
    return;
  }

  conversationMap.set(partnerUserId, {
    userId: partnerUserId,
    lastMessageTimestamp: serverTimestamp,
    lastMessageId: messageId,
    lastMessageCiphertext: ciphertext,
    lastMessageSenderId: senderUserId,
    lastMessageDirection: direction,
    unreadCount: 0,
  });
}

/**
 * List paginated message history between the authenticated device and a target user.
 */
export async function listConversationMessages(
  userId: string,
  deviceId: string,
  targetUserId: string,
  options: ListConversationMessagesOptions = {},
): Promise<ListConversationMessagesResult> {
  const limit = normalizeLimit(options.limit);
  const order = options.order ?? 'desc';
  const cursorSk = decodeCursor(options.cursor, order);
  const sourceLimit = limit + 1;

  const [inboundMessages, outboundMessages] = await Promise.all([
    queryConversationSource({
      pk: inboxPk(userId, deviceId),
      partnerAttribute: 'senderUserId',
      targetUserId,
      direction: 'inbound',
      order,
      cursorSk,
      limit: sourceLimit,
    }),
    queryConversationSource({
      pk: outboxPk(userId, deviceId),
      partnerAttribute: 'recipientUserId',
      targetUserId,
      direction: 'outbound',
      order,
      cursorSk,
      limit: sourceLimit,
    }),
  ]);

  const merged = sortAndDedupeMessages([...inboundMessages, ...outboundMessages], order);
  const page = merged.slice(0, limit);
  const nextCursor = merged.length > limit && page.length > 0
    ? encodeCursor(page[page.length - 1].sortKey, order)
    : null;

  return {
    messages: page.map(({ sortKey: _sortKey, ...message }) => message),
    nextCursor,
  };
}

async function queryConversationSource(params: {
  pk: string;
  partnerAttribute: 'senderUserId' | 'recipientUserId';
  targetUserId: string;
  direction: ConversationDirection;
  order: ConversationHistoryOrder;
  cursorSk?: string;
  limit: number;
}): Promise<InternalConversationMessage[]> {
  const items: InternalConversationMessage[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  const expressionAttributeValues: Record<string, unknown> = {
    ':pk': params.pk,
    ':targetUserId': params.targetUserId,
  };
  const expressionAttributeNames: Record<string, string> = {
    '#partner': params.partnerAttribute,
  };
  let keyConditionExpression = 'pk = :pk';

  if (params.cursorSk) {
    keyConditionExpression += params.order === 'desc'
      ? ' AND #sk < :cursorSk'
      : ' AND #sk > :cursorSk';
    expressionAttributeValues[':cursorSk'] = params.cursorSk;
    expressionAttributeNames['#sk'] = 'sk';
  }

  do {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: keyConditionExpression,
      FilterExpression: '#partner = :targetUserId',
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: params.order === 'asc',
      Limit: 100,
      ExclusiveStartKey: exclusiveStartKey,
    }));

    for (const item of result.Items ?? []) {
      items.push(toConversationHistoryMessage(item as Record<string, unknown>, params.direction));
      if (items.length >= params.limit) {
        return items;
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items;
}

async function queryAllByPk(pk: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': pk,
      },
      ExclusiveStartKey: exclusiveStartKey,
    }));

    items.push(...((result.Items ?? []) as Record<string, unknown>[]));
    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items;
}

function sortAndDedupeMessages(
  messages: InternalConversationMessage[],
  order: ConversationHistoryOrder,
): InternalConversationMessage[] {
  const deduped = new Map<string, InternalConversationMessage>();

  for (const message of messages) {
    deduped.set(`${message.direction}:${message.messageId}`, message);
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const bySortKey = a.sortKey.localeCompare(b.sortKey);
    if (bySortKey !== 0) {
      return order === 'asc' ? bySortKey : -bySortKey;
    }
    return a.direction.localeCompare(b.direction);
  });
}

function normalizeLimit(limit?: number): number {
  const normalized = limit ?? 50;

  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 200) {
    throw new AppError('VALIDATION_ERROR', 'Limit must be between 1 and 200', 400);
  }

  return normalized;
}

function decodeCursor(
  cursor: string | undefined,
  order: ConversationHistoryOrder,
): string | undefined {
  if (!cursor) {
    return undefined;
  }

  let parsed: CursorPayload;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid cursor', 400);
  }

  if (typeof parsed.sk !== 'string' || parsed.sk.length === 0 || parsed.order !== order) {
    throw new AppError('VALIDATION_ERROR', 'Invalid cursor', 400);
  }

  return parsed.sk;
}

function encodeCursor(sk: string, order: ConversationHistoryOrder): string {
  const payload: CursorPayload = { sk, order };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function toConversationHistoryMessage(
  item: Record<string, unknown>,
  direction: ConversationDirection,
): InternalConversationMessage {
  const record = toMessageRecord(item);
  const sortKey = (item.sk as string | undefined) ?? messageSk(record.serverTimestamp, record.messageId);

  return {
    messageId: record.messageId,
    senderUserId: record.senderUserId,
    senderDeviceId: record.senderDeviceId,
    recipientUserId: record.recipientUserId,
    recipientDeviceId: record.recipientDeviceId,
    ciphertext: record.ciphertext,
    deliveryState: record.deliveryState,
    serverTimestamp: record.serverTimestamp,
    direction,
    sortKey,
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

  const serverTimestamp = getServerTimestamp(item) as string;

  return {
    messageId: item.messageId as string,
    senderUserId: item.senderUserId as string,
    senderDeviceId: item.senderDeviceId as string,
    recipientUserId: recipientUserId as string,
    recipientDeviceId: recipientDeviceId as string,
    ciphertext: item.ciphertext as string,
    ...(item.senderCiphertext !== undefined && { senderCiphertext: item.senderCiphertext as string }),
    deliveryState: item.deliveryState as DeliveryState,
    serverTimestamp,
    updatedAt: (item.updatedAt as string) ?? serverTimestamp,
  };
}

function getServerTimestamp(item: Record<string, unknown>): string | undefined {
  const explicitTimestamp = item.serverTimestamp as string | undefined;
  if (explicitTimestamp) {
    return explicitTimestamp;
  }

  const sk = item.sk as string | undefined;
  if (!sk) {
    return undefined;
  }

  const [timestampPart] = sk.split('#');
  return timestampPart;
}
