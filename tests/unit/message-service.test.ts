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
import { sendMessage, checkRetentionPolicy } from '../../src/messages/message-service.js';
import type { WebSocketConnectionContext } from '../../src/auth/websocket-auth.js';
import type { DirectMessageRequest, DeliveryState, MessageRecord } from '../../src/messages/message-model.js';

describe('message-service', () => {
  const senderContext: WebSocketConnectionContext = {
    userId: 'sender-user',
    deviceId: 'sender-device',
    connectionId: 'sender-conn',
  };

  const baseRequest: DirectMessageRequest = {
    messageId: 'msg-001',
    recipientUserId: 'recipient-user',
    recipientDeviceId: 'recipient-device',
    ciphertext: 'encrypted-payload-base64',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MessageRepository.createMessage).mockResolvedValue(null);
    vi.mocked(MessageRepository.updateDeliveryState).mockResolvedValue();
    vi.mocked(MessageRelayPublisher.publishDeliveryStatus).mockResolvedValue();
  });

  describe('sendMessage (new message)', () => {
    it('persists the message and relays to online recipient', async () => {
      vi.mocked(MessageRelayPublisher.relayDirectMessage).mockResolvedValue('delivered');

      const result = await sendMessage(senderContext, baseRequest);

      expect(result.messageId).toBe('msg-001');
      expect(result.status).toBe('delivered');
      expect(result.serverTimestamp).toBeDefined();

      expect(MessageRepository.createMessage).toHaveBeenCalledOnce();
      const record = vi.mocked(MessageRepository.createMessage).mock.calls[0][0];
      expect(record).toMatchObject({
        messageId: 'msg-001',
        senderUserId: 'sender-user',
        senderDeviceId: 'sender-device',
        recipientUserId: 'recipient-user',
        recipientDeviceId: 'recipient-device',
        ciphertext: 'encrypted-payload-base64',
        deliveryState: 'accepted',
      });
    });

    it('updates state to delivered when relay succeeds', async () => {
      vi.mocked(MessageRelayPublisher.relayDirectMessage).mockResolvedValue('delivered');

      await sendMessage(senderContext, baseRequest);

      expect(MessageRepository.updateDeliveryState).toHaveBeenCalledOnce();
      const [_record, newState] = vi.mocked(MessageRepository.updateDeliveryState).mock.calls[0] as [unknown, DeliveryState];
      expect(newState).toBe('delivered');
    });

    it('updates state to accepted-queued when recipient is offline', async () => {
      vi.mocked(MessageRelayPublisher.relayDirectMessage).mockResolvedValue('accepted-queued');

      const result = await sendMessage(senderContext, baseRequest);

      expect(result.status).toBe('accepted-queued');
      expect(MessageRepository.updateDeliveryState).toHaveBeenCalledOnce();
    });

    it('notifies the sender of the delivery outcome', async () => {
      vi.mocked(MessageRelayPublisher.relayDirectMessage).mockResolvedValue('delivered');

      await sendMessage(senderContext, baseRequest);

      expect(MessageRelayPublisher.publishDeliveryStatus).toHaveBeenCalledWith(
        'sender-user',
        'sender-device',
        'msg-001',
        'delivered',
      );
    });

    it('does not update delivery state when outcome is still accepted', async () => {
      vi.mocked(MessageRelayPublisher.relayDirectMessage).mockResolvedValue('accepted' as DeliveryState);

      await sendMessage(senderContext, baseRequest);

      expect(MessageRepository.updateDeliveryState).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage (duplicate/retry)', () => {
    it('returns stored outcome without creating duplicate side effects', async () => {
      const existingRecord: MessageRecord = {
        messageId: 'msg-001',
        senderUserId: 'sender-user',
        senderDeviceId: 'sender-device',
        recipientUserId: 'recipient-user',
        recipientDeviceId: 'recipient-device',
        ciphertext: 'encrypted-payload-base64',
        deliveryState: 'delivered',
        serverTimestamp: '2026-04-01T10:00:00.000Z',
        updatedAt: '2026-04-01T10:00:01.000Z',
      };

      // createMessage returns existing record (duplicate detected)
      vi.mocked(MessageRepository.createMessage).mockResolvedValue(existingRecord);

      const result = await sendMessage(senderContext, baseRequest);

      expect(result.messageId).toBe('msg-001');
      expect(result.status).toBe('delivered');
      expect(result.serverTimestamp).toBe('2026-04-01T10:00:00.000Z');

      // No relay attempt on duplicate
      expect(MessageRelayPublisher.relayDirectMessage).not.toHaveBeenCalled();
      // No state update on duplicate
      expect(MessageRepository.updateDeliveryState).not.toHaveBeenCalled();
      // No sender notification on duplicate
      expect(MessageRelayPublisher.publishDeliveryStatus).not.toHaveBeenCalled();
    });

    it('returns accepted-queued outcome for a previously queued duplicate', async () => {
      const existingRecord: MessageRecord = {
        messageId: 'msg-002',
        senderUserId: 'sender-user',
        senderDeviceId: 'sender-device',
        recipientUserId: 'recipient-user',
        recipientDeviceId: 'recipient-device',
        ciphertext: 'encrypted-payload',
        deliveryState: 'accepted-queued',
        serverTimestamp: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-01T09:00:00.000Z',
      };

      vi.mocked(MessageRepository.createMessage).mockResolvedValue(existingRecord);

      const result = await sendMessage(senderContext, { ...baseRequest, messageId: 'msg-002' });

      expect(result.status).toBe('accepted-queued');
      expect(MessageRelayPublisher.relayDirectMessage).not.toHaveBeenCalled();
    });
  });

  describe('checkRetentionPolicy', () => {
    it('expires queued messages older than retention window', async () => {
      const expiredRecord: MessageRecord = {
        messageId: 'msg-expired',
        senderUserId: 'sender-user',
        senderDeviceId: 'sender-device',
        recipientUserId: 'recipient-user',
        recipientDeviceId: 'recipient-device',
        ciphertext: 'old-payload',
        deliveryState: 'accepted-queued',
        serverTimestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
        updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const result = await checkRetentionPolicy(expiredRecord);

      expect(result).toBe(true);
      expect(MessageRepository.updateDeliveryState).toHaveBeenCalledWith(expiredRecord, 'failed');
      expect(MessageRelayPublisher.publishDeliveryStatus).toHaveBeenCalledWith(
        'sender-user',
        'sender-device',
        'msg-expired',
        'failed',
      );
    });

    it('does not expire messages within retention window', async () => {
      const recentRecord: MessageRecord = {
        messageId: 'msg-recent',
        senderUserId: 'sender-user',
        senderDeviceId: 'sender-device',
        recipientUserId: 'recipient-user',
        recipientDeviceId: 'recipient-device',
        ciphertext: 'recent-payload',
        deliveryState: 'accepted-queued',
        serverTimestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const result = await checkRetentionPolicy(recentRecord);

      expect(result).toBe(false);
      expect(MessageRepository.updateDeliveryState).not.toHaveBeenCalled();
    });

    it('ignores non-queued messages', async () => {
      const deliveredRecord: MessageRecord = {
        messageId: 'msg-delivered',
        senderUserId: 'sender-user',
        senderDeviceId: 'sender-device',
        recipientUserId: 'recipient-user',
        recipientDeviceId: 'recipient-device',
        ciphertext: 'payload',
        deliveryState: 'delivered',
        serverTimestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const result = await checkRetentionPolicy(deliveredRecord);

      expect(result).toBe(false);
      expect(MessageRepository.updateDeliveryState).not.toHaveBeenCalled();
    });
  });
});
