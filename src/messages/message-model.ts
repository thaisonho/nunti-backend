/**
 * Direct-message contracts for 1:1 encrypted messaging.
 *
 * Delivery state machine:
 *   accepted → delivered       (live relay succeeded)
 *   accepted → accepted-queued (recipient offline at send time)
 *   accepted-queued → delivered (reconnect replay or later delivery)
 *   accepted-queued → failed   (retention policy expired)
 *
 * Event types:
 *   direct-message   — encrypted payload pushed to recipient device
 *   delivery-status  — sender-facing state transition notification
 *   replay-complete  — end-of-backlog signal after reconnect catch-up
 *   error            — structured WebSocket error event
 */

/** Delivery state values for the message lifecycle. */
export type DeliveryState =
  | 'accepted'
  | 'delivered'
  | 'accepted-queued'
  | 'failed'
  | 'replay-complete';

/** Client-sent direct-message relay request. */
export interface DirectMessageRequest {
  messageId: string;
  recipientUserId: string;
  recipientDeviceId: string;
  ciphertext: string;
}

/** Server-pushed encrypted message event to recipient device. */
export interface DirectMessageEvent {
  eventType: 'direct-message';
  messageId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  recipientDeviceId: string;
  ciphertext: string;
  serverTimestamp: string;
}

/** Server-pushed delivery status event to sender device. */
export interface DeliveryStatusEvent {
  eventType: 'delivery-status';
  messageId: string;
  status: DeliveryState;
  serverTimestamp: string;
}

/** Server-pushed replay-complete event after reconnect backlog drain. */
export interface ReplayCompleteEvent {
  eventType: 'replay-complete';
  deviceId: string;
  messagesReplayed: number;
  serverTimestamp: string;
}

/** Structured WebSocket error event. */
export interface WebSocketErrorEvent {
  eventType: 'error';
  code: string;
  message: string;
  requestId?: string;
}

/** Persisted message record in the messages table. */
export interface MessageRecord {
  messageId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  recipientDeviceId: string;
  ciphertext: string;
  deliveryState: DeliveryState;
  serverTimestamp: string;
  updatedAt: string;
}

/** Result returned to the sender after a send request. */
export interface SendMessageResult {
  messageId: string;
  status: DeliveryState;
  serverTimestamp: string;
}

/** Validate and extract a DirectMessageRequest from an unknown payload. */
export function validateDirectMessageRequest(body: unknown): DirectMessageRequest {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Invalid message payload: expected object');
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.messageId !== 'string' || obj.messageId.length === 0) {
    throw new Error('Invalid message payload: messageId required');
  }

  if (typeof obj.recipientUserId !== 'string' || obj.recipientUserId.length === 0) {
    throw new Error('Invalid message payload: recipientUserId required');
  }

  if (typeof obj.recipientDeviceId !== 'string' || obj.recipientDeviceId.length === 0) {
    throw new Error('Invalid message payload: recipientDeviceId required');
  }

  if (typeof obj.ciphertext !== 'string' || obj.ciphertext.length === 0) {
    throw new Error('Invalid message payload: ciphertext required');
  }

  return {
    messageId: obj.messageId,
    recipientUserId: obj.recipientUserId,
    recipientDeviceId: obj.recipientDeviceId,
    ciphertext: obj.ciphertext,
  };
}
