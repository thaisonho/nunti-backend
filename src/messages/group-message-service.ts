import type { WebSocketConnectionContext } from '../auth/websocket-auth.js';
import { isDeviceTrusted } from '../devices/device-policy.js';
import * as DeviceService from '../devices/device-service.js';
import type {
  GroupMembershipCommandRequest,
  GroupMembershipEvent,
  GroupMembershipProjection,
  MembershipChangeType,
  GroupSendRequest,
  GroupSendResult,
  GroupMessageRecord,
  GroupMessageProjection,
  GroupRecipientSnapshot,
  GroupDeviceOutcome,
} from './group-message-model.js';
import * as GroupMessageRepository from './group-message-repository.js';
import * as GroupRelayPublisher from '../realtime/group-relay-publisher.js';

export interface GroupMembershipChangeResult {
  requestId: string;
  eventId: string;
  status: 'accepted';
  serverTimestamp: string;
}

export async function processMembershipChange(
  context: WebSocketConnectionContext,
  request: GroupMembershipCommandRequest,
): Promise<GroupMembershipChangeResult> {
  await applyMembershipMutation(request.groupId, request.changeType, request.targetUserId);

  const recipientUserIds = await resolveRecipientUserIds(request.groupId, context.userId);
  const projections = await buildDeviceProjections(recipientUserIds);

  const serverTimestamp = new Date().toISOString();
  const eventId = await GroupMessageRepository.allocateMembershipEventId(request.groupId);
  const event: GroupMembershipEvent = {
    eventType: 'group-membership-event',
    eventId,
    groupId: request.groupId,
    changeType: request.changeType,
    actorUserId: context.userId,
    targetUserId: request.targetUserId,
    serverTimestamp,
  };

  await GroupMessageRepository.createMembershipEvent(
    {
      ...event,
      createdAt: serverTimestamp,
    },
    projections,
  );

  for (const projection of projections) {
    const outcome = await GroupRelayPublisher.publishMembershipEvent(
      projection.userId,
      projection.deviceId,
      event,
    );

    if (outcome === 'delivered') {
      await GroupMessageRepository.markMembershipProjectionDelivered(
        projection.userId,
        projection.deviceId,
        event.serverTimestamp,
        event.eventId,
      );
    }
  }

  return {
    requestId: request.requestId,
    eventId: event.eventId,
    status: 'accepted',
    serverTimestamp,
  };
}

export async function replayMembershipBacklog(context: WebSocketConnectionContext): Promise<void> {
  const queuedEvents = await GroupMessageRepository.listQueuedMembershipEvents(context.userId, context.deviceId);
  let replayed = 0;

  for (const queued of queuedEvents) {
    const event: GroupMembershipEvent = {
      eventType: 'group-membership-event',
      eventId: queued.eventId,
      groupId: queued.groupId,
      changeType: queued.changeType,
      actorUserId: queued.actorUserId,
      targetUserId: queued.targetUserId,
      serverTimestamp: queued.serverTimestamp,
    };

    const outcome = await GroupRelayPublisher.publishMembershipEvent(
      context.userId,
      context.deviceId,
      event,
    );

    if (outcome === 'delivered') {
      await GroupMessageRepository.markMembershipProjectionDelivered(
        context.userId,
        context.deviceId,
        queued.serverTimestamp,
        queued.eventId,
      );
      replayed += 1;
    }
  }

  await GroupRelayPublisher.publishMembershipReplayComplete(
    context.userId,
    context.deviceId,
    replayed,
  );
}

async function applyMembershipMutation(
  groupId: string,
  changeType: MembershipChangeType,
  targetUserId: string,
): Promise<void> {
  if (changeType === 'member-joined') {
    await GroupMessageRepository.addGroupMember(groupId, targetUserId);
    return;
  }

  if (changeType === 'member-left' || changeType === 'member-removed-by-admin') {
    await GroupMessageRepository.removeGroupMember(groupId, targetUserId);
    return;
  }
}

async function resolveRecipientUserIds(groupId: string, actorUserId: string): Promise<string[]> {
  const groupMembers = await GroupMessageRepository.listGroupMemberUserIds(groupId);
  const unique = new Set<string>(groupMembers);
  unique.add(actorUserId);
  return [...unique].sort();
}

async function buildDeviceProjections(userIds: string[]): Promise<GroupMembershipProjection[]> {
  const projections: GroupMembershipProjection[] = [];

  for (const userId of userIds) {
    const devices = await DeviceService.listDevices(userId);
    for (const device of devices) {
      if (!isDeviceTrusted(device)) {
        continue;
      }

      projections.push({
        userId,
        deviceId: device.deviceId,
      });
    }
  }

  return projections;
}

// ============================================================================
// Group Send Orchestration
// ============================================================================

/**
 * Process a group message send request (idempotent).
 *
 * Captures recipient snapshot at accept time, creates canonical message record
 * and per-device projections, then fans out to all online devices.
 */
export async function sendGroupMessage(
  context: WebSocketConnectionContext,
  request: GroupSendRequest,
): Promise<GroupSendResult> {
  const serverTimestamp = new Date().toISOString();

  // Capture recipient snapshot at accept time (excludes sender)
  const recipientSnapshot = await captureRecipientSnapshot(request.groupId, context.userId);

  // Build projections for recipient devices and sender's other devices
  const recipientProjections = await buildGroupMessageProjections(
    recipientSnapshot.userIds,
    'recipient',
  );
  const senderMirrorProjections = await buildSenderMirrorProjections(
    context.userId,
    context.deviceId,
  );
  const allProjections = [...recipientProjections, ...senderMirrorProjections];

  // Build canonical message record (including attachments if present)
  const record: GroupMessageRecord = {
    groupMessageId: request.groupMessageId,
    groupId: request.groupId,
    senderUserId: context.userId,
    senderDeviceId: context.deviceId,
    ciphertext: request.ciphertext,
    recipientSnapshot,
    serverTimestamp,
    createdAt: serverTimestamp,
    ...(request.attachments && request.attachments.length > 0 && { attachments: request.attachments }),
  };

  // Attempt idempotent canonical write
  const existingRecord = await GroupMessageRepository.createGroupMessage(record, allProjections);

  if (existingRecord) {
    // Duplicate send — return prior stored result without side effects
    return {
      groupMessageId: existingRecord.groupMessageId,
      status: 'accepted',
      recipientUserCount: existingRecord.recipientSnapshot.userIds.length,
      targetDeviceCount: countProjectionsForSnapshot(existingRecord, allProjections),
      serverTimestamp: existingRecord.serverTimestamp,
    };
  }

  // Fan out to recipient devices
  for (const projection of recipientProjections) {
    await fanOutToDevice(context, record, projection);
  }

  // Fan out to sender's other trusted devices (sender-sync)
  for (const projection of senderMirrorProjections) {
    await fanOutToDevice(context, record, projection);
  }

  return {
    groupMessageId: request.groupMessageId,
    status: 'accepted',
    recipientUserCount: recipientSnapshot.userIds.length,
    targetDeviceCount: allProjections.length,
    serverTimestamp,
  };
}

/**
 * Capture recipient user IDs at accept time.
 * Recipients are all group members except the sender.
 */
async function captureRecipientSnapshot(
  groupId: string,
  senderUserId: string,
): Promise<GroupRecipientSnapshot> {
  const memberUserIds = await GroupMessageRepository.listGroupMemberUserIds(groupId);
  const recipientUserIds = memberUserIds.filter((uid) => uid !== senderUserId);

  return {
    userIds: recipientUserIds.sort(),
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Build per-device projections for a list of user IDs.
 */
async function buildGroupMessageProjections(
  userIds: string[],
  audience: 'recipient' | 'sender-sync',
): Promise<GroupMessageProjection[]> {
  const projections: GroupMessageProjection[] = [];

  for (const userId of userIds) {
    const devices = await DeviceService.listDevices(userId);
    for (const device of devices) {
      if (!isDeviceTrusted(device)) {
        continue;
      }
      projections.push({
        userId,
        deviceId: device.deviceId,
        audience,
      });
    }
  }

  return projections;
}

/**
 * Build projections for sender's other trusted devices.
 */
async function buildSenderMirrorProjections(
  senderUserId: string,
  senderDeviceId: string,
): Promise<GroupMessageProjection[]> {
  const devices = await DeviceService.listDevices(senderUserId);
  const projections: GroupMessageProjection[] = [];

  for (const device of devices) {
    if (!isDeviceTrusted(device)) {
      continue;
    }
    // Exclude the sending device
    if (device.deviceId === senderDeviceId) {
      continue;
    }
    projections.push({
      userId: senderUserId,
      deviceId: device.deviceId,
      audience: 'sender-sync',
    });
  }

  return projections;
}

/**
 * Fan out a group message to a single device.
 */
async function fanOutToDevice(
  context: WebSocketConnectionContext,
  record: GroupMessageRecord,
  projection: GroupMessageProjection,
): Promise<void> {
  const outcome = await GroupRelayPublisher.publishGroupMessage(
    projection.userId,
    projection.deviceId,
    {
      eventType: 'group-message',
      groupMessageId: record.groupMessageId,
      groupId: record.groupId,
      senderUserId: record.senderUserId,
      senderDeviceId: record.senderDeviceId,
      ciphertext: record.ciphertext,
      serverTimestamp: record.serverTimestamp,
      audience: projection.audience,
      ...(record.attachments && { attachments: record.attachments }),
    },
  );

  if (outcome === 'delivered') {
    await GroupMessageRepository.markGroupMessageProjectionDelivered(
      projection.userId,
      projection.deviceId,
      record.serverTimestamp,
      record.groupMessageId,
    );
  }

  // Publish per-device status event to sender
  await GroupRelayPublisher.publishGroupDeviceStatus(
    context.userId,
    context.deviceId,
    {
      eventType: 'group-device-status',
      groupMessageId: record.groupMessageId,
      recipientUserId: projection.userId,
      recipientDeviceId: projection.deviceId,
      status: outcome,
      audience: projection.audience,
      serverTimestamp: new Date().toISOString(),
    },
  );
}

/**
 * Replay queued group messages for a reconnecting device.
 */
export async function replayGroupMessageBacklog(context: WebSocketConnectionContext): Promise<void> {
  const queuedMessages = await GroupMessageRepository.listQueuedGroupMessages(
    context.userId,
    context.deviceId,
  );
  let replayed = 0;

  for (const queued of queuedMessages) {
    const outcome = await GroupRelayPublisher.publishGroupMessage(
      context.userId,
      context.deviceId,
      {
        eventType: 'group-message',
        groupMessageId: queued.groupMessageId,
        groupId: queued.groupId,
        senderUserId: queued.senderUserId,
        senderDeviceId: queued.senderDeviceId,
        ciphertext: queued.ciphertext,
        serverTimestamp: queued.serverTimestamp,
        audience: queued.audience,
        ...(queued.attachments && { attachments: queued.attachments }),
      },
    );

    if (outcome === 'delivered') {
      await GroupMessageRepository.markGroupMessageProjectionDelivered(
        context.userId,
        context.deviceId,
        queued.serverTimestamp,
        queued.groupMessageId,
      );
      replayed += 1;
    }
  }

  await GroupRelayPublisher.publishGroupMessageReplayComplete(
    context.userId,
    context.deviceId,
    replayed,
  );
}

function countProjectionsForSnapshot(
  record: GroupMessageRecord,
  projections: GroupMessageProjection[],
): number {
  // In case of duplicate, we don't have access to original projections,
  // but we can estimate based on the snapshot
  return projections.length;
}
