import { randomUUID } from 'crypto';
import { AppError } from '../app/errors.js';
import type { WebSocketConnectionContext } from '../auth/websocket-auth.js';
import type { GroupMemberRecord, GroupRecord } from '../messages/group-message-model.js';
import * as GroupMessageRepository from '../messages/group-message-repository.js';
import * as GroupMessageService from '../messages/group-message-service.js';

export interface CreateGroupInput {
  actorUserId: string;
  actorDeviceId: string;
  groupId?: string;
  groupName?: string;
  memberUserIds?: string[];
}

export interface GroupDetails extends GroupRecord {
  members: GroupMemberRecord[];
}

export interface MembershipOperationResult {
  groupId: string;
  targetUserId: string;
  requestId: string;
  eventId: string;
  status: 'accepted';
  serverTimestamp: string;
}

export async function createGroup(input: CreateGroupInput): Promise<GroupDetails> {
  const groupId = input.groupId?.trim() || randomUUID();
  const groupName = normalizeOptionalString(input.groupName);
  const now = new Date().toISOString();

  try {
    await GroupMessageRepository.createGroup(
      {
        groupId,
        ...(groupName && { groupName }),
        createdByUserId: input.actorUserId,
        createdAt: now,
        updatedAt: now,
      },
      input.actorUserId,
    );
  } catch (error) {
    if ((error as { name?: string }).name === 'TransactionCanceledException') {
      throw new AppError('CONFLICT', 'Group already exists', 409);
    }
    throw error;
  }

  const initialMemberUserIds = normalizeMemberIds(input.memberUserIds, input.actorUserId);
  for (const targetUserId of initialMemberUserIds) {
    await GroupMessageService.processMembershipChange(
      buildServiceContext(input.actorUserId, input.actorDeviceId),
      {
        requestId: randomUUID(),
        groupId,
        changeType: 'member-joined',
        targetUserId,
      },
    );
  }

  return getGroupDetails(input.actorUserId, groupId);
}

export async function getGroupDetails(actorUserId: string, groupId: string): Promise<GroupDetails> {
  const [group, actorMembership] = await Promise.all([
    GroupMessageRepository.getGroup(groupId),
    GroupMessageRepository.getGroupMember(groupId, actorUserId),
  ]);

  if (!group) {
    throw new AppError('RESOURCE_NOT_FOUND', 'Group not found', 404);
  }

  if (!actorMembership) {
    throw new AppError('AUTH_FORBIDDEN', 'Forbidden group action', 403);
  }

  const members = await GroupMessageRepository.listGroupMembers(groupId);
  return {
    ...group,
    members,
  };
}

export async function listGroupMembers(actorUserId: string, groupId: string): Promise<GroupMemberRecord[]> {
  const [group, actorMembership] = await Promise.all([
    GroupMessageRepository.getGroup(groupId),
    GroupMessageRepository.getGroupMember(groupId, actorUserId),
  ]);

  if (!group) {
    throw new AppError('RESOURCE_NOT_FOUND', 'Group not found', 404);
  }

  if (!actorMembership) {
    throw new AppError('AUTH_FORBIDDEN', 'Forbidden group action', 403);
  }

  return GroupMessageRepository.listGroupMembers(groupId);
}

export async function addGroupMember(
  actorUserId: string,
  actorDeviceId: string,
  groupId: string,
  targetUserId: string,
): Promise<MembershipOperationResult> {
  if (targetUserId === actorUserId) {
    throw new AppError('VALIDATION_ERROR', 'Cannot add actor as member', 400);
  }

  const result = await GroupMessageService.processMembershipChange(
    buildServiceContext(actorUserId, actorDeviceId),
    {
      requestId: randomUUID(),
      groupId,
      changeType: 'member-joined',
      targetUserId,
    },
  );

  return {
    groupId,
    targetUserId,
    ...result,
  };
}

export async function removeGroupMember(
  actorUserId: string,
  actorDeviceId: string,
  groupId: string,
  targetUserId: string,
): Promise<MembershipOperationResult> {
  if (targetUserId === actorUserId) {
    throw new AppError('VALIDATION_ERROR', 'Use leave endpoint for self-removal', 400);
  }

  const result = await GroupMessageService.processMembershipChange(
    buildServiceContext(actorUserId, actorDeviceId),
    {
      requestId: randomUUID(),
      groupId,
      changeType: 'member-removed-by-admin',
      targetUserId,
    },
  );

  return {
    groupId,
    targetUserId,
    ...result,
  };
}

export async function leaveGroup(
  actorUserId: string,
  actorDeviceId: string,
  groupId: string,
): Promise<MembershipOperationResult> {
  const result = await GroupMessageService.processMembershipChange(
    buildServiceContext(actorUserId, actorDeviceId),
    {
      requestId: randomUUID(),
      groupId,
      changeType: 'member-left',
      targetUserId: actorUserId,
    },
  );

  return {
    groupId,
    targetUserId: actorUserId,
    ...result,
  };
}

function buildServiceContext(userId: string, deviceId: string): WebSocketConnectionContext {
  return {
    userId,
    deviceId,
    connectionId: `http-${deviceId}`,
  };
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeMemberIds(memberUserIds: string[] | undefined, actorUserId: string): string[] {
  if (!memberUserIds || memberUserIds.length === 0) {
    return [];
  }

  const unique = new Set<string>();
  for (const memberUserId of memberUserIds) {
    const normalized = memberUserId.trim();
    if (normalized.length === 0 || normalized === actorUserId) {
      continue;
    }
    unique.add(normalized);
  }

  return [...unique];
}
