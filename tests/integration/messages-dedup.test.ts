import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/messages/message-repository.js');
vi.mock('../../src/realtime/message-relay-publisher.js');
vi.mock('../../src/realtime/connection-registry.js');
vi.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: class { send = vi.fn(); },
  PostToConnectionCommand: class { constructor(_: unknown) {} },
}));
vi.mock('../../src/devices/device-repository.js', () => ({
  ddbDocClient: { send: vi.fn() },
}));
vi.mock('../../src/app/config.js', () => ({
  getConfig: () => ({
    devicesTableName: 'test-devices',
    messagesTableName: 'test-messages',
    cognitoUserPoolId: 'pool-id',
    cognitoAppClientId: 'client-id',
    cognitoRegion: 'us-east-1',
    stage: 'test',
  }),
}));

import * as MessageRepository from '../../src/messages/message-repository.js';
import * as MessageRelayPublisher from '../../src/realtime/message-relay-publisher.js';
import { sendMessage } from '../../src/messages/message-service.js';
import type { WebSocketConnectionContext } from '../../src/auth/websocket-auth.js';
import type { DirectMessageRequest, MessageRecord } from '../../src/messages/message-model.js';

describe('messages-dedup (idempotent retry)', () => {
  const senderContext: WebSocketConnectionContext = {
    userId: 'sender-user',
    deviceId: 'sender-device',
    connectionId: 'sender-conn',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MessageRepository.updateDeliveryState).mockResolvedValue();
    vi.mocked(MessageRelayPublisher.publishDeliveryStatus).mockResolvedValue();
  });

  it('first send creates message and attempts relay', async () => {
    vi.mocked(MessageRepository.createMessage).mockResolvedValue(null);
    vi.mocked(MessageRelayPublisher.relayDirectMessage).mockResolvedValue('delivered');

    const request: DirectMessageRequest = {
      messageId: 'dedup-msg-001',
      recipientUserId: 'recipient-user',
      recipientDeviceId: 'recipient-device',
      ciphertext: 'encrypted-payload',
    };

    const result = await sendMessage(senderContext, request);

    expect(result.messageId).toBe('dedup-msg-001');
    expect(result.status).toBe('delivered');
    expect(MessageRepository.createMessage).toHaveBeenCalledOnce();
    expect(MessageRelayPublisher.relayDirectMessage).toHaveBeenCalledOnce();
  });

  it('duplicate send returns stored outcome without relay attempt', async () => {
    const stored: MessageRecord = {
      messageId: 'dedup-msg-001',
      senderUserId: 'sender-user',
      senderDeviceId: 'sender-device',
      recipientUserId: 'recipient-user',
      recipientDeviceId: 'recipient-device',
      ciphertext: 'encrypted-payload',
      deliveryState: 'delivered',
      serverTimestamp: '2026-04-01T10:00:00.000Z',
      updatedAt: '2026-04-01T10:00:01.000Z',
    };

    vi.mocked(MessageRepository.createMessage).mockResolvedValue(stored);

    const request: DirectMessageRequest = {
      messageId: 'dedup-msg-001',
      recipientUserId: 'recipient-user',
      recipientDeviceId: 'recipient-device',
      ciphertext: 'encrypted-payload',
    };

    const result = await sendMessage(senderContext, request);

    expect(result.messageId).toBe('dedup-msg-001');
    expect(result.status).toBe('delivered');
    expect(result.serverTimestamp).toBe('2026-04-01T10:00:00.000Z');

    // No duplicate side effects
    expect(MessageRelayPublisher.relayDirectMessage).not.toHaveBeenCalled();
    expect(MessageRepository.updateDeliveryState).not.toHaveBeenCalled();
    expect(MessageRelayPublisher.publishDeliveryStatus).not.toHaveBeenCalled();
  });

  it('duplicate of queued message returns accepted-queued without retrying relay', async () => {
    const stored: MessageRecord = {
      messageId: 'dedup-msg-002',
      senderUserId: 'sender-user',
      senderDeviceId: 'sender-device',
      recipientUserId: 'recipient-user',
      recipientDeviceId: 'recipient-device',
      ciphertext: 'encrypted-payload',
      deliveryState: 'accepted-queued',
      serverTimestamp: '2026-04-01T09:00:00.000Z',
      updatedAt: '2026-04-01T09:00:00.000Z',
    };

    vi.mocked(MessageRepository.createMessage).mockResolvedValue(stored);

    const request: DirectMessageRequest = {
      messageId: 'dedup-msg-002',
      recipientUserId: 'recipient-user',
      recipientDeviceId: 'recipient-device',
      ciphertext: 'encrypted-payload',
    };

    const result = await sendMessage(senderContext, request);

    expect(result.status).toBe('accepted-queued');
    expect(MessageRelayPublisher.relayDirectMessage).not.toHaveBeenCalled();
  });

  it('multiple rapid retries all return the same stored outcome', async () => {
    const stored: MessageRecord = {
      messageId: 'dedup-msg-003',
      senderUserId: 'sender-user',
      senderDeviceId: 'sender-device',
      recipientUserId: 'recipient-user',
      recipientDeviceId: 'recipient-device',
      ciphertext: 'encrypted-payload',
      deliveryState: 'delivered',
      serverTimestamp: '2026-04-01T10:00:00.000Z',
      updatedAt: '2026-04-01T10:00:01.000Z',
    };

    vi.mocked(MessageRepository.createMessage).mockResolvedValue(stored);

    const request: DirectMessageRequest = {
      messageId: 'dedup-msg-003',
      recipientUserId: 'recipient-user',
      recipientDeviceId: 'recipient-device',
      ciphertext: 'encrypted-payload',
    };

    // Simulate 3 rapid retries
    const results = await Promise.all([
      sendMessage(senderContext, request),
      sendMessage(senderContext, request),
      sendMessage(senderContext, request),
    ]);

    expect(results.every(r => r.status === 'delivered')).toBe(true);
    expect(results.every(r => r.serverTimestamp === '2026-04-01T10:00:00.000Z')).toBe(true);
    expect(MessageRelayPublisher.relayDirectMessage).not.toHaveBeenCalled();
  });
});
