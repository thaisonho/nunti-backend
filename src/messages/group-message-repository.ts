import { GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { ddbDocClient } from '../devices/device-repository.js';
import { getConfig } from '../app/config.js';
import type {
  GroupMembershipEvent,
  GroupMembershipProjection,
  GroupMessageRecord,
  GroupMessageProjection,
  GroupMessageProjectionRecord,
} from './group-message-model.js';
import { buildMembershipProjectionSk, buildGroupMessageProjectionSk } from './group-message-model.js';

export interface GroupMembershipEventRecord extends GroupMembershipEvent {
  createdAt: string;
}

export interface GroupMembershipProjectionRecord extends GroupMembershipEvent {
  projectionType: 'membership-event';
  userId: string;
  deviceId: string;
  delivered: boolean;
}

function getTableName(): string {
  return getConfig().messagesTableName;
}

function membershipEventPk(eventId: string): string {
  return `GEVT#${eventId}`;
}

function groupTimelinePk(groupId: string): string {
  return `GROUP#${groupId}`;
}

function groupMemberPk(groupId: string): string {
  return `GROUPMEMBERS#${groupId}`;
}

function groupMemberSk(userId: string): string {
  return `USER#${userId}`;
}

function membershipCounterPk(groupId: string): string {
  return `GROUPCOUNTER#${groupId}`;
}

function membershipCounterSk(): string {
  return 'COUNTER#membership-events';
}

function inboxPk(userId: string, deviceId: string): string {
  return `GINBOX#${userId}#${deviceId}`;
}

function timelineSk(serverTimestamp: string, eventId: string): string {
  return `${serverTimestamp}#${eventId}`;
}

export async function allocateMembershipEventId(groupId: string): Promise<string> {
  const result = await ddbDocClient.send(new UpdateCommand({
    TableName: getTableName(),
    Key: {
      pk: membershipCounterPk(groupId),
      sk: membershipCounterSk(),
    },
    UpdateExpression: 'SET updatedAt = :now ADD sequence :inc',
    ExpressionAttributeValues: {
      ':now': new Date().toISOString(),
      ':inc': 1,
    },
    ReturnValues: 'UPDATED_NEW',
  }));

  const sequence = Number((result.Attributes as Record<string, unknown> | undefined)?.sequence ?? 0);
  return `mev-${groupId}-${String(sequence).padStart(12, '0')}`;
}

export async function createMembershipEvent(
  record: GroupMembershipEventRecord,
  projections: GroupMembershipProjection[],
): Promise<void> {
  const eventSk = timelineSk(record.serverTimestamp, record.eventId);

  await ddbDocClient.send(new PutCommand({
    TableName: getTableName(),
    Item: {
      pk: membershipEventPk(record.eventId),
      sk: membershipEventPk(record.eventId),
      ...record,
    },
    ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
  }));

  await ddbDocClient.send(new PutCommand({
    TableName: getTableName(),
    Item: {
      pk: groupTimelinePk(record.groupId),
      sk: eventSk,
      projectionType: 'membership-event',
      ...record,
    },
  }));

  for (const projection of projections) {
    await ddbDocClient.send(new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: inboxPk(projection.userId, projection.deviceId),
        sk: buildMembershipProjectionSk(record.serverTimestamp, record.eventId),
        projectionType: 'membership-event',
        userId: projection.userId,
        deviceId: projection.deviceId,
        delivered: false,
        ...record,
      },
    }));
  }
}

export async function markMembershipProjectionDelivered(
  userId: string,
  deviceId: string,
  serverTimestamp: string,
  eventId: string,
): Promise<void> {
  await ddbDocClient.send(new UpdateCommand({
    TableName: getTableName(),
    Key: {
      pk: inboxPk(userId, deviceId),
      sk: buildMembershipProjectionSk(serverTimestamp, eventId),
    },
    UpdateExpression: 'SET delivered = :delivered',
    ExpressionAttributeValues: {
      ':delivered': true,
    },
  }));
}

export async function listQueuedMembershipEvents(
  userId: string,
  deviceId: string,
): Promise<GroupMembershipProjectionRecord[]> {
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: 'pk = :pk',
    FilterExpression: 'projectionType = :projectionType AND delivered = :delivered',
    ExpressionAttributeValues: {
      ':pk': inboxPk(userId, deviceId),
      ':projectionType': 'membership-event',
      ':delivered': false,
    },
    ScanIndexForward: true,
  }));

  return (result.Items ?? []).map((item) => toProjectionRecord(item as Record<string, unknown>));
}

export async function listGroupMemberUserIds(groupId: string): Promise<string[]> {
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: {
      ':pk': groupMemberPk(groupId),
      ':prefix': 'USER#',
    },
    ScanIndexForward: true,
  }));

  return (result.Items ?? [])
    .map((item) => (item as Record<string, unknown>).userId)
    .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0);
}

export async function addGroupMember(groupId: string, userId: string): Promise<void> {
  await ddbDocClient.send(new PutCommand({
    TableName: getTableName(),
    Item: {
      pk: groupMemberPk(groupId),
      sk: groupMemberSk(userId),
      userId,
      joinedAt: new Date().toISOString(),
    },
  }));
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  await ddbDocClient.send(new DeleteCommand({
    TableName: getTableName(),
    Key: {
      pk: groupMemberPk(groupId),
      sk: groupMemberSk(userId),
    },
  }));
}

export async function getMembershipEvent(eventId: string): Promise<GroupMembershipEventRecord | null> {
  const result = await ddbDocClient.send(new GetCommand({
    TableName: getTableName(),
    Key: {
      pk: membershipEventPk(eventId),
      sk: membershipEventPk(eventId),
    },
    ConsistentRead: true,
  }));

  if (!result.Item) {
    return null;
  }

  return toEventRecord(result.Item as Record<string, unknown>);
}

function toEventRecord(item: Record<string, unknown>): GroupMembershipEventRecord {
  return {
    eventType: 'group-membership-event',
    eventId: item.eventId as string,
    groupId: item.groupId as string,
    changeType: item.changeType as GroupMembershipEvent['changeType'],
    actorUserId: item.actorUserId as string,
    targetUserId: item.targetUserId as string,
    serverTimestamp: item.serverTimestamp as string,
    createdAt: item.createdAt as string,
  };
}

function toProjectionRecord(item: Record<string, unknown>): GroupMembershipProjectionRecord {
  return {
    eventType: 'group-membership-event',
    projectionType: 'membership-event',
    userId: item.userId as string,
    deviceId: item.deviceId as string,
    delivered: Boolean(item.delivered),
    eventId: item.eventId as string,
    groupId: item.groupId as string,
    changeType: item.changeType as GroupMembershipEvent['changeType'],
    actorUserId: item.actorUserId as string,
    targetUserId: item.targetUserId as string,
    serverTimestamp: item.serverTimestamp as string,
  };
}

// ============================================================================
// Group Message Persistence (for group send)
// ============================================================================

function groupMessagePk(groupMessageId: string): string {
  return `GMSG#${groupMessageId}`;
}

function groupMessageTimelinePk(groupId: string): string {
  return `GROUPMSGS#${groupId}`;
}

/**
 * Attempt to create a group message record (idempotent).
 * Returns null if this is a new message, or the existing record if duplicate.
 */
export async function createGroupMessage(
  record: GroupMessageRecord,
  projections: GroupMessageProjection[],
): Promise<GroupMessageRecord | null> {
  const canonicalSk = groupMessagePk(record.groupMessageId);
  const timelineSk = buildGroupMessageProjectionSk(record.serverTimestamp, record.groupMessageId);

  // Attempt canonical write with idempotency key
  try {
    await ddbDocClient.send(new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: groupMessagePk(record.groupMessageId),
        sk: canonicalSk,
        ...record,
      },
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
    }));
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      // Duplicate - fetch and return existing record
      const existing = await getGroupMessage(record.groupMessageId);
      return existing;
    }
    throw error;
  }

  // Write timeline row
  await ddbDocClient.send(new PutCommand({
    TableName: getTableName(),
    Item: {
      pk: groupMessageTimelinePk(record.groupId),
      sk: timelineSk,
      projectionType: 'group-message',
      ...record,
    },
  }));

  // Write per-device projection rows
  for (const projection of projections) {
    await ddbDocClient.send(new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: inboxPk(projection.userId, projection.deviceId),
        sk: buildGroupMessageProjectionSk(record.serverTimestamp, record.groupMessageId),
        projectionType: 'group-message',
        userId: projection.userId,
        deviceId: projection.deviceId,
        audience: projection.audience,
        delivered: false,
        ...record,
      },
    }));
  }

  return null; // New message created
}

/**
 * Retrieve a group message by ID.
 */
export async function getGroupMessage(groupMessageId: string): Promise<GroupMessageRecord | null> {
  const result = await ddbDocClient.send(new GetCommand({
    TableName: getTableName(),
    Key: {
      pk: groupMessagePk(groupMessageId),
      sk: groupMessagePk(groupMessageId),
    },
    ConsistentRead: true,
  }));

  if (!result.Item) {
    return null;
  }

  return toGroupMessageRecord(result.Item as Record<string, unknown>);
}

/**
 * Mark a group message projection as delivered.
 */
export async function markGroupMessageProjectionDelivered(
  userId: string,
  deviceId: string,
  serverTimestamp: string,
  groupMessageId: string,
): Promise<void> {
  await ddbDocClient.send(new UpdateCommand({
    TableName: getTableName(),
    Key: {
      pk: inboxPk(userId, deviceId),
      sk: buildGroupMessageProjectionSk(serverTimestamp, groupMessageId),
    },
    UpdateExpression: 'SET delivered = :delivered',
    ExpressionAttributeValues: {
      ':delivered': true,
    },
  }));
}

/**
 * List queued (undelivered) group messages for a device.
 */
export async function listQueuedGroupMessages(
  userId: string,
  deviceId: string,
): Promise<GroupMessageProjectionRecord[]> {
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: 'pk = :pk',
    FilterExpression: 'projectionType = :projectionType AND delivered = :delivered',
    ExpressionAttributeValues: {
      ':pk': inboxPk(userId, deviceId),
      ':projectionType': 'group-message',
      ':delivered': false,
    },
    ScanIndexForward: true,
  }));

  return (result.Items ?? []).map((item) => toGroupMessageProjectionRecord(item as Record<string, unknown>));
}

function toGroupMessageRecord(item: Record<string, unknown>): GroupMessageRecord {
  return {
    groupMessageId: item.groupMessageId as string,
    groupId: item.groupId as string,
    senderUserId: item.senderUserId as string,
    senderDeviceId: item.senderDeviceId as string,
    ciphertext: item.ciphertext as string,
    recipientSnapshot: item.recipientSnapshot as GroupMessageRecord['recipientSnapshot'],
    serverTimestamp: item.serverTimestamp as string,
    createdAt: item.createdAt as string,
  };
}

function toGroupMessageProjectionRecord(item: Record<string, unknown>): GroupMessageProjectionRecord {
  return {
    projectionType: 'group-message',
    userId: item.userId as string,
    deviceId: item.deviceId as string,
    audience: item.audience as 'recipient' | 'sender-sync',
    delivered: Boolean(item.delivered),
    groupMessageId: item.groupMessageId as string,
    groupId: item.groupId as string,
    senderUserId: item.senderUserId as string,
    senderDeviceId: item.senderDeviceId as string,
    ciphertext: item.ciphertext as string,
    recipientSnapshot: item.recipientSnapshot as GroupMessageRecord['recipientSnapshot'],
    serverTimestamp: item.serverTimestamp as string,
    createdAt: item.createdAt as string,
  };
}
