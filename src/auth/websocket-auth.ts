/**
 * WebSocket identity extraction for authenticated device connections.
 *
 * Extracts user identity (via Cognito JWT) and device identity from
 * the API Gateway WebSocket $connect event. Tokens can be passed via
 * Authorization header or `token` query parameter. Device ID is
 * required in query parameters.
 */

import { requireAuth } from './auth-guard.js';
import * as DeviceService from '../devices/device-service.js';
import { isDeviceTrusted } from '../devices/device-policy.js';
import { AuthError } from '../app/errors.js';

/** Authenticated WebSocket connection identity. */
export interface WebSocketConnectionContext {
  userId: string;
  deviceId: string;
  connectionId: string;
}

/** WebSocket event shape relevant for auth extraction. */
interface WebSocketConnectEvent {
  requestContext: {
    connectionId: string;
  };
  queryStringParameters?: Record<string, string> | null;
  headers?: Record<string, string> | null;
}

/**
 * Extract authenticated user and device context from a WebSocket connection event.
 *
 * Token resolution order:
 *   1. Authorization header (preferred — standard Bearer format)
 *   2. `token` query parameter (fallback for WebSocket clients that cannot set headers)
 *
 * @throws AuthError if token is missing, invalid, or expired
 * @throws Error if deviceId is missing from query parameters
 */
export async function extractWebSocketContext(
  event: WebSocketConnectEvent,
): Promise<WebSocketConnectionContext> {
  const connectionId = event.requestContext.connectionId;
  const queryParams = event.queryStringParameters ?? {};
  const headers = event.headers ?? {};

  // Resolve auth token: prefer header, fall back to query param
  const authHeader = headers.Authorization ?? headers.authorization ?? null;
  const queryToken = queryParams.token ?? null;

  let bearerValue: string;
  if (authHeader) {
    bearerValue = authHeader;
  } else if (queryToken) {
    bearerValue = `Bearer ${queryToken}`;
  } else {
    bearerValue = '';
  }

  // Verify token via existing auth guard
  const user = await requireAuth(bearerValue || null);

  // Extract device identity from query parameters
  const deviceId = queryParams.deviceId;
  if (!deviceId || deviceId.length === 0) {
    throw new Error('Missing required query parameter: deviceId');
  }

  const devices = await DeviceService.listDevices(user.sub);
  const activeDevice = devices.find((device) => device.deviceId === deviceId);
  if (!activeDevice || !isDeviceTrusted(activeDevice)) {
    throw new AuthError('AUTH_FORBIDDEN', 403);
  }

  return {
    userId: user.sub,
    deviceId,
    connectionId,
  };
}
