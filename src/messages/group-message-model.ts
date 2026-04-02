import { z } from 'zod';
import type { DeliveryState } from './message-model.js';

export const membershipChangeTypes = [
  'member-joined',
  'member-left',
  'member-removed-by-admin',
  'member-role-updated',
  'group-profile-updated',
] as const;

export type MembershipChangeType = (typeof membershipChangeTypes)[number];

export interface GroupMembershipCommandRequest {
  requestId: string;
  groupId: string;
  changeType: MembershipChangeType;
  targetUserId: string;
}

export interface GroupMembershipEvent {
  eventType: 'group-membership-event';
  eventId: string;
  groupId: string;
  changeType: MembershipChangeType;
  actorUserId: string;
  targetUserId: string;
  serverTimestamp: string;
}

export interface GroupReplayCompleteEvent {
  eventType: 'group-replay-complete';
  deviceId: string;
  eventsReplayed: number;
  serverTimestamp: string;
}

export interface GroupMembershipProjection {
  userId: string;
  deviceId: string;
}

// ============================================================================
// Group Send Contracts
// ============================================================================

/** Per-device delivery outcome for group message fanout */
export type GroupDeviceOutcome = 'delivered' | 'accepted-queued' | 'failed';

/** Client-sent group message request */
export interface GroupSendRequest {
  groupMessageId: string;
  groupId: string;
  ciphertext: string;
}

/** Immediate accepted result returned to sender */
export interface GroupSendResult {
  groupMessageId: string;
  status: 'accepted';
  recipientUserCount: number;
  targetDeviceCount: number;
  serverTimestamp: string;
}

/** Server-pushed group message event to recipient/mirror devices */
export interface GroupMessageEvent {
  eventType: 'group-message';
  groupMessageId: string;
  groupId: string;
  senderUserId: string;
  senderDeviceId: string;
  ciphertext: string;
  serverTimestamp: string;
  audience?: 'recipient' | 'sender-sync';
}

/** Per-device delivery status event for group message */
export interface GroupDeviceStatusEvent {
  eventType: 'group-device-status';
  groupMessageId: string;
  recipientUserId: string;
  recipientDeviceId: string;
  status: GroupDeviceOutcome;
  audience: 'recipient' | 'sender-sync';
  serverTimestamp: string;
}

/** Recipient snapshot captured at accept time for deterministic fanout */
export interface GroupRecipientSnapshot {
  userIds: string[];
  capturedAt: string;
}

/** Per-device projection row for group message delivery */
export interface GroupMessageProjection {
  userId: string;
  deviceId: string;
  audience: 'recipient' | 'sender-sync';
}

/** Persisted canonical group message record */
export interface GroupMessageRecord {
  groupMessageId: string;
  groupId: string;
  senderUserId: string;
  senderDeviceId: string;
  ciphertext: string;
  recipientSnapshot: GroupRecipientSnapshot;
  serverTimestamp: string;
  createdAt: string;
}

/** Persisted per-device projection record */
export interface GroupMessageProjectionRecord extends GroupMessageRecord {
  projectionType: 'group-message';
  userId: string;
  deviceId: string;
  audience: 'recipient' | 'sender-sync';
  delivered: boolean;
}

const groupMembershipCommandRequestSchema = z
  .object({
    requestId: z.string().min(1),
    groupId: z.string().min(1),
    changeType: z.enum(membershipChangeTypes),
    targetUserId: z.string().min(1),
  })
  .strict();

const groupMembershipEventSchema = z
  .object({
    eventType: z.literal('group-membership-event'),
    eventId: z.string().min(1),
    groupId: z.string().min(1),
    changeType: z.enum(membershipChangeTypes),
    actorUserId: z.string().min(1),
    targetUserId: z.string().min(1),
    serverTimestamp: z.string().datetime({ offset: true }),
  })
  .strict();

export function validateGroupMembershipCommandRequest(body: unknown): GroupMembershipCommandRequest {
  return groupMembershipCommandRequestSchema.parse(body);
}

export function validateGroupMembershipEvent(body: unknown): GroupMembershipEvent {
  return groupMembershipEventSchema.parse(body);
}

export function buildMembershipProjectionSk(serverTimestamp: string, eventId: string): string {
  return `${serverTimestamp}#${eventId}`;
}

// Group send request validation
const groupSendRequestSchema = z
  .object({
    groupMessageId: z.string().min(1),
    groupId: z.string().min(1),
    ciphertext: z.string().min(1),
  })
  .strict();

export function validateGroupSendRequest(body: unknown): GroupSendRequest {
  return groupSendRequestSchema.parse(body);
}

export function buildGroupMessageProjectionSk(serverTimestamp: string, groupMessageId: string): string {
  return `${serverTimestamp}#${groupMessageId}`;
}
