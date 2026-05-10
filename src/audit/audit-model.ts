/**
 * Audit log data model — type definitions for security audit trail.
 *
 * Categories:
 *   KEY_PROVISIONING — key bundle upload, rotation, bootstrap fetch
 *   LOGIN — sign-in, sign-up, token refresh, WebSocket connect/disconnect
 *   AUTHENTICATION — email verification, JWT failure, device trust
 *   RESOURCE_ACCESS — device CRUD, user search, group ops, messaging
 *
 * Sensitive data (passwords, tokens, private keys, ciphertext) MUST NOT
 * appear in any audit log entry.
 */

export type AuditCategory =
  | 'KEY_PROVISIONING'
  | 'LOGIN'
  | 'AUTHENTICATION'
  | 'RESOURCE_ACCESS';

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface AuditLogEntry {
  /** User who triggered the event (Cognito sub) */
  userId: string;
  /** Event category */
  category: AuditCategory;
  /** Machine-readable action name (e.g., SIGNIN_SUCCESS) */
  action: string;
  /** Outcome of the action */
  outcome: AuditOutcome;
  /** Device that triggered the event (nullable for pre-device events) */
  deviceId?: string;
  /** Source IP from API Gateway requestContext */
  ipAddress?: string;
  /** User-Agent header (truncated to 256 chars) */
  userAgent?: string;
  /** Action-specific metadata (no secrets) */
  metadata?: Record<string, unknown>;
  /** ISO-8601 UTC timestamp */
  timestamp: string;
}

export interface PaginatedAuditLogs {
  logs: AuditLogEntry[];
  nextCursor?: string;
}

export interface AuditQueryOptions {
  category?: AuditCategory;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface AdminAuditQueryOptions extends AuditQueryOptions {
  userId?: string;
}
