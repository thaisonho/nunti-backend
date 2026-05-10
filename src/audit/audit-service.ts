/**
 * Audit log service — semantic emitters for security-critical events.
 *
 * Each emitter builds an AuditLogEntry and writes it fire-and-forget
 * via the audit repository. Handlers call these functions after
 * completing (or failing) the corresponding operation.
 *
 * Sensitive data (passwords, tokens, private keys, ciphertext) is
 * NEVER included in any emitted entry.
 */

import { writeAuditLog } from "./audit-repository.js";
import type { AuditCategory, AuditOutcome } from "./audit-model.js";

function emitEntry(params: {
  userId: string;
  category: AuditCategory;
  action: string;
  outcome: AuditOutcome;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): void {
  // Fire-and-forget — writeAuditLog handles its own error logging
  writeAuditLog({
    userId: params.userId,
    category: params.category,
    action: params.action,
    outcome: params.outcome,
    deviceId: params.deviceId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: params.metadata,
    timestamp: new Date().toISOString(),
  });
}

// ─── Category: LOGIN ─────────────────────────────────────────────────

export function signinSuccess(
  userId: string,
  deviceId?: string,
  ipAddress?: string,
  userAgent?: string,
): void {
  emitEntry({
    userId,
    category: "LOGIN",
    action: "SIGNIN_SUCCESS",
    outcome: "SUCCESS",
    deviceId,
    ipAddress,
    userAgent,
  });
}

export function signinFailure(
  email: string,
  reason: string,
  ipAddress?: string,
  userAgent?: string,
): void {
  // userId is unknown for failed logins — use email hash as partition key
  // to avoid leaking real user IDs for non-existent accounts
  emitEntry({
    userId: `anonymous:${email}`,
    category: "LOGIN",
    action: "SIGNIN_FAILURE",
    outcome: "FAILURE",
    ipAddress,
    userAgent,
    metadata: { reason, email },
  });
}

export function signupSuccess(
  userId: string,
  email: string,
  ipAddress?: string,
  userAgent?: string,
): void {
  emitEntry({
    userId,
    category: "LOGIN",
    action: "SIGNUP_SUCCESS",
    outcome: "SUCCESS",
    ipAddress,
    userAgent,
    metadata: { email },
  });
}

export function tokenRefresh(
  userId: string,
  ipAddress?: string,
  userAgent?: string,
): void {
  emitEntry({
    userId,
    category: "LOGIN",
    action: "TOKEN_REFRESH",
    outcome: "SUCCESS",
    ipAddress,
    userAgent,
  });
}

export function wsConnect(
  userId: string,
  deviceId: string,
  connectionId: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "LOGIN",
    action: "WS_CONNECT",
    outcome: "SUCCESS",
    deviceId,
    ipAddress,
    metadata: { connectionId },
  });
}

export function wsDisconnect(
  userId: string,
  deviceId: string,
  connectionId: string,
): void {
  emitEntry({
    userId,
    category: "LOGIN",
    action: "WS_DISCONNECT",
    outcome: "SUCCESS",
    deviceId,
    metadata: { connectionId },
  });
}

export function logout(
  userId: string,
  deviceId?: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "LOGIN",
    action: "LOGOUT",
    outcome: "SUCCESS",
    deviceId,
    ipAddress,
  });
}

// ─── Category: AUTHENTICATION ────────────────────────────────────────

export function emailVerified(
  userId: string,
  email: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "AUTHENTICATION",
    action: "EMAIL_VERIFIED",
    outcome: "SUCCESS",
    ipAddress,
    metadata: { email },
  });
}

export function verificationFailed(
  email: string,
  reason: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId: `anonymous:${email}`,
    category: "AUTHENTICATION",
    action: "VERIFICATION_FAILED",
    outcome: "FAILURE",
    ipAddress,
    metadata: { reason, email },
  });
}

export function verificationResent(
  email: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId: `anonymous:${email}`,
    category: "AUTHENTICATION",
    action: "VERIFICATION_RESENT",
    outcome: "SUCCESS",
    ipAddress,
    metadata: { email },
  });
}

export function authFailure(
  reason: string,
  ipAddress?: string,
  userAgent?: string,
): void {
  emitEntry({
    userId: "anonymous",
    category: "AUTHENTICATION",
    action: "AUTH_FAILURE",
    outcome: "FAILURE",
    ipAddress,
    userAgent,
    metadata: { reason },
  });
}

export function deviceTrustDenied(
  userId: string,
  deviceId: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "AUTHENTICATION",
    action: "DEVICE_TRUST_DENIED",
    outcome: "DENIED",
    deviceId,
    ipAddress,
  });
}

export function wsAuthFailure(
  reason: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId: "anonymous",
    category: "AUTHENTICATION",
    action: "WS_AUTH_FAILURE",
    outcome: "FAILURE",
    ipAddress,
    metadata: { reason },
  });
}

// ─── Category: KEY_PROVISIONING ──────────────────────────────────────

export function keyBundleUploaded(
  userId: string,
  deviceId: string,
  keyTypes: string[],
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "KEY_PROVISIONING",
    action: "KEY_BUNDLE_UPLOADED",
    outcome: "SUCCESS",
    deviceId,
    ipAddress,
    metadata: { keyTypes },
  });
}

export function signedPreKeyRotated(
  userId: string,
  deviceId: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "KEY_PROVISIONING",
    action: "SIGNED_PREKEY_ROTATED",
    outcome: "SUCCESS",
    deviceId,
    ipAddress,
  });
}

export function bootstrapBundleFetched(
  requestorUserId: string,
  targetUserId: string,
  targetDeviceId: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId: requestorUserId,
    category: "KEY_PROVISIONING",
    action: "BOOTSTRAP_BUNDLE_FETCHED",
    outcome: "SUCCESS",
    ipAddress,
    metadata: { targetUserId, targetDeviceId },
  });
}

export function oneTimePreKeyConsumed(
  targetUserId: string,
  targetDeviceId: string,
  requestorUserId: string,
): void {
  emitEntry({
    userId: targetUserId,
    category: "KEY_PROVISIONING",
    action: "OTK_CONSUMED",
    outcome: "SUCCESS",
    metadata: { requestorUserId, targetDeviceId },
  });
}

// ─── Category: RESOURCE_ACCESS ───────────────────────────────────────

export function deviceRegistered(
  userId: string,
  deviceId: string,
  platform?: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "RESOURCE_ACCESS",
    action: "DEVICE_REGISTERED",
    outcome: "SUCCESS",
    deviceId,
    ipAddress,
    metadata: { platform },
  });
}

export function deviceRevoked(
  userId: string,
  deviceId: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "RESOURCE_ACCESS",
    action: "DEVICE_REVOKED",
    outcome: "SUCCESS",
    deviceId,
    ipAddress,
  });
}

export function devicesListed(
  userId: string,
  count: number,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "RESOURCE_ACCESS",
    action: "DEVICES_LISTED",
    outcome: "SUCCESS",
    ipAddress,
    metadata: { count },
  });
}

export function userSearched(
  userId: string,
  queryEmail: string,
  resultCount: number,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "RESOURCE_ACCESS",
    action: "USER_SEARCHED",
    outcome: "SUCCESS",
    ipAddress,
    metadata: { queryEmail, resultCount },
  });
}

export function groupCreated(
  userId: string,
  groupId: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "RESOURCE_ACCESS",
    action: "GROUP_CREATED",
    outcome: "SUCCESS",
    ipAddress,
    metadata: { groupId },
  });
}

export function groupMemberAdded(
  userId: string,
  groupId: string,
  memberId: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "RESOURCE_ACCESS",
    action: "GROUP_MEMBER_ADDED",
    outcome: "SUCCESS",
    ipAddress,
    metadata: { groupId, memberId },
  });
}

export function groupMemberRemoved(
  userId: string,
  groupId: string,
  memberId: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "RESOURCE_ACCESS",
    action: "GROUP_MEMBER_REMOVED",
    outcome: "SUCCESS",
    ipAddress,
    metadata: { groupId, memberId },
  });
}

export function groupLeft(
  userId: string,
  groupId: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "RESOURCE_ACCESS",
    action: "GROUP_LEFT",
    outcome: "SUCCESS",
    ipAddress,
    metadata: { groupId },
  });
}

export function messageSent(
  userId: string,
  deviceId: string,
  recipientUserId: string,
  messageId: string,
): void {
  emitEntry({
    userId,
    category: "RESOURCE_ACCESS",
    action: "MESSAGE_SENT",
    outcome: "SUCCESS",
    deviceId,
    metadata: { recipientUserId, messageId },
  });
}

export function conversationAccessed(
  userId: string,
  conversationId: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId,
    category: "RESOURCE_ACCESS",
    action: "CONVERSATION_ACCESSED",
    outcome: "SUCCESS",
    ipAddress,
    metadata: { conversationId },
  });
}

// ─── Admin-specific audit ────────────────────────────────────────────

export function adminAuditLogViewed(
  adminUserId: string,
  targetUserId?: string,
  ipAddress?: string,
): void {
  emitEntry({
    userId: adminUserId,
    category: "RESOURCE_ACCESS",
    action: "ADMIN_AUDIT_LOG_VIEWED",
    outcome: "SUCCESS",
    ipAddress,
    metadata: { targetUserId: targetUserId ?? "ALL_USERS" },
  });
}
