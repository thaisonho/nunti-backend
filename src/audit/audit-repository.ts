/**
 * Audit log repository — DynamoDB operations for security audit trail.
 *
 * Table schema:
 *   PK: USER#{userId}
 *   SK: AUDIT#{timestamp}#{uuid}
 *
 * GSI1 (Admin Query Index):
 *   gsi1pk: AUDIT_LOG (constant)
 *   gsi1sk: {timestamp}#{userId}
 *   Projection: ALL
 *
 * Write operations are fire-and-forget: failures are logged but never
 * propagated to the caller.
 *
 * TTL: 90 days from creation (DynamoDB TTL on `ttl` attribute).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  type QueryCommandInput,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { getConfig } from "../app/config.js";
import type {
  AuditLogEntry,
  PaginatedAuditLogs,
  AuditQueryOptions,
  AdminAuditQueryOptions,
} from "./audit-model.js";

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

/** 90 days in seconds */
const TTL_SECONDS = 90 * 24 * 60 * 60;

function getTableName(): string {
  return getConfig().auditLogsTableName;
}

function auditPk(userId: string): string {
  return `USER#${userId}`;
}

function auditSk(timestamp: string): string {
  return `AUDIT#${timestamp}#${randomUUID()}`;
}

/**
 * Write a single audit log entry to DynamoDB.
 *
 * Fire-and-forget — errors are caught and logged internally.
 * This function should never throw or block the calling handler.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const now = entry.timestamp || new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;

    await ddbDocClient.send(
      new PutCommand({
        TableName: getTableName(),
        Item: {
          pk: auditPk(entry.userId),
          sk: auditSk(now),
          userId: entry.userId,
          category: entry.category,
          action: entry.action,
          outcome: entry.outcome,
          timestamp: now,
          ttl,
          // GSI1 keys for admin queries
          gsi1pk: "AUDIT_LOG",
          gsi1sk: `${now}#${entry.userId}`,
          // Optional fields
          ...(entry.deviceId && { deviceId: entry.deviceId }),
          ...(entry.ipAddress && { ipAddress: entry.ipAddress }),
          ...(entry.userAgent && {
            userAgent: entry.userAgent.slice(0, 256),
          }),
          ...(entry.metadata &&
            Object.keys(entry.metadata).length > 0 && {
              metadata: entry.metadata,
            }),
        },
      }),
    );
  } catch (error) {
    // Fire-and-forget — log but never propagate
    console.error("[AUDIT] Failed to write audit log:", {
      action: entry.action,
      category: entry.category,
      error: (error as Error).message,
    });
  }
}

/**
 * Decode a pagination cursor from base64.
 * Returns undefined if cursor is falsy or invalid.
 */
function decodeCursor(
  cursor?: string,
): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
  } catch {
    return undefined;
  }
}

/**
 * Encode a DynamoDB LastEvaluatedKey as a base64 pagination cursor.
 */
function encodeCursor(
  lastEvaluatedKey?: Record<string, unknown>,
): string | undefined {
  if (!lastEvaluatedKey) return undefined;
  return Buffer.from(JSON.stringify(lastEvaluatedKey)).toString("base64");
}

/**
 * Build date range bounds for sort key queries.
 */
function buildDateBounds(from?: string, to?: string) {
  const fromDate =
    from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  // Append high-surrogate suffix to make the upper bound inclusive
  const toDate = to
    ? `${to}\uffff`
    : `${new Date().toISOString()}\uffff`;
  return { fromDate, toDate };
}

function toAuditLogEntry(item: Record<string, unknown>): AuditLogEntry {
  return {
    userId: item.userId as string,
    category: item.category as AuditLogEntry["category"],
    action: item.action as string,
    outcome: item.outcome as AuditLogEntry["outcome"],
    timestamp: item.timestamp as string,
    ...(item.deviceId !== undefined && {
      deviceId: item.deviceId as string,
    }),
    ...(item.ipAddress !== undefined && {
      ipAddress: item.ipAddress as string,
    }),
    ...(item.userAgent !== undefined && {
      userAgent: item.userAgent as string,
    }),
    ...(item.metadata !== undefined && {
      metadata: item.metadata as Record<string, unknown>,
    }),
  };
}

async function executePaginatedAuditQuery(
  input: Omit<QueryCommandInput, "ExclusiveStartKey" | "Limit">,
  options: {
    cursor?: string;
    limit: number;
    hasFilter: boolean;
  },
): Promise<PaginatedAuditLogs> {
  const items: Record<string, unknown>[] = [];
  let lastEvaluatedKey = decodeCursor(options.cursor);

  do {
    const remaining = options.limit - items.length;
    if (remaining <= 0) {
      break;
    }

    const result = await ddbDocClient.send(
      new QueryCommand({
        ...input,
        Limit: options.hasFilter ? remaining : options.limit,
        ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
      }),
    );

    items.push(...((result.Items ?? []) as Record<string, unknown>[]));
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;

    if (!options.hasFilter || !lastEvaluatedKey) {
      break;
    }
  } while (items.length < options.limit);

  return {
    logs: items.map((item) => toAuditLogEntry(item)),
    nextCursor: encodeCursor(lastEvaluatedKey),
  };
}

/**
 * Query audit logs for a specific user (user-scoped).
 *
 * Uses the main table PK = USER#{userId} with SK range filtering.
 */
export async function queryUserAuditLogs(
  userId: string,
  options: AuditQueryOptions = {},
): Promise<PaginatedAuditLogs> {
  const limit = Math.min(Math.max(options.limit || 50, 1), 200);
  const { fromDate, toDate } = buildDateBounds(options.from, options.to);

  const expressionValues: Record<string, unknown> = {
    ":pk": auditPk(userId),
    ":skFrom": `AUDIT#${fromDate}`,
    ":skTo": `AUDIT#${toDate}`,
  };

  const expressionNames: Record<string, string> = {};
  let filterExpression: string | undefined;

  if (options.category) {
    filterExpression = "#cat = :cat";
    expressionValues[":cat"] = options.category;
    expressionNames["#cat"] = "category";
  }

  return executePaginatedAuditQuery(
    {
      TableName: getTableName(),
      KeyConditionExpression:
        "pk = :pk AND sk BETWEEN :skFrom AND :skTo",
      ExpressionAttributeValues: expressionValues,
      ...(Object.keys(expressionNames).length > 0 && {
        ExpressionAttributeNames: expressionNames,
      }),
      ...(filterExpression && { FilterExpression: filterExpression }),
      ScanIndexForward: false,
    },
    {
      cursor: options.cursor,
      limit,
      hasFilter: Boolean(filterExpression),
    },
  );
}

/**
 * Query audit logs across all users (admin-scoped).
 *
 * Uses GSI1 with gsi1pk = AUDIT_LOG and gsi1sk range for time filtering.
 * Supports optional userId and category filters via FilterExpression.
 */
export async function queryAllAuditLogs(
  options: AdminAuditQueryOptions = {},
): Promise<PaginatedAuditLogs> {
  const limit = Math.min(Math.max(options.limit || 50, 1), 200);
  const { fromDate, toDate } = buildDateBounds(options.from, options.to);

  const expressionValues: Record<string, unknown> = {
    ":gsi1pk": "AUDIT_LOG",
    ":gsi1skFrom": fromDate,
    ":gsi1skTo": toDate,
  };

  const expressionNames: Record<string, string> = {};
  const filterParts: string[] = [];

  if (options.category) {
    filterParts.push("#cat = :cat");
    expressionValues[":cat"] = options.category;
    expressionNames["#cat"] = "category";
  }

  if (options.userId) {
    filterParts.push("userId = :filterUserId");
    expressionValues[":filterUserId"] = options.userId;
  }

  const filterExpression =
    filterParts.length > 0 ? filterParts.join(" AND ") : undefined;

  return executePaginatedAuditQuery(
    {
      TableName: getTableName(),
      IndexName: "GSI1",
      KeyConditionExpression:
        "gsi1pk = :gsi1pk AND gsi1sk BETWEEN :gsi1skFrom AND :gsi1skTo",
      ExpressionAttributeValues: expressionValues,
      ...(Object.keys(expressionNames).length > 0 && {
        ExpressionAttributeNames: expressionNames,
      }),
      ...(filterExpression && { FilterExpression: filterExpression }),
      ScanIndexForward: false,
    },
    {
      cursor: options.cursor,
      limit,
      hasFilter: Boolean(filterExpression),
    },
  );
}
