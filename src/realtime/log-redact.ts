/**
 * Log redaction utilities for realtime publishers.
 *
 * Replaces raw sensitive identifiers (userId, deviceId, connectionId)
 * with truncated hashes while preserving non-sensitive triage metadata
 * (error name and event type).
 *
 * Raw Authorization headers, query tokens, and message bodies
 * MUST NOT appear in warning or error logs.
 */

import { createHash } from 'node:crypto';

/**
 * Redact an identifier to a stable, non-reversible short hash.
 * Produces the first 8 characters of a SHA-256 hex digest.
 *
 * @example redactId('user-abc-123') → 'a1b2c3d4'
 */
export function redactId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

/** Structured log metadata safe for warning/error output. */
export interface RedactedLogMeta {
  /** Short hash of the user identifier */
  userId: string;
  /** Short hash of the connection identifier */
  connectionId: string;
  /** Short hash of the device identifier (when applicable) */
  deviceId?: string;
  /** Original error name/code (not sensitive) */
  errorName: string;
  /** Event type for triage (e.g., 'direct-message', 'trust-change') */
  eventType: string;
}

/**
 * Build a redacted log metadata object from raw identifiers.
 * All user/device/connection IDs are hashed. Error names and event types
 * are preserved as-is since they contain no user data.
 */
export function buildRedactedMeta(params: {
  userId: string;
  connectionId: string;
  deviceId?: string;
  errorName: string;
  eventType: string;
}): RedactedLogMeta {
  const meta: RedactedLogMeta = {
    userId: redactId(params.userId),
    connectionId: redactId(params.connectionId),
    errorName: params.errorName,
    eventType: params.eventType,
  };

  if (params.deviceId) {
    meta.deviceId = redactId(params.deviceId);
  }

  return meta;
}
