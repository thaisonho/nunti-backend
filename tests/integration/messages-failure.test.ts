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
import { checkRetentionPolicy, replayBacklog } from '../../src/messages/message-service.js';
import type { WebSocketConnectionContext } from '../../src/auth/websocket-auth.js';
import type { MessageRecord } from '../../src/messages/message-model.js';

describe('messages-failure (retention policy)', () => {
  const context: WebSocketConnectionContext = {
    userId: 'recipient-user',
    deviceId: 'recipient-device',
    connectionId: 'conn-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MessageRepository.updateDeliveryState).mockResolvedValue();
    vi.mocked(MessageRelayPublisher.publishDeliveryStatus).mockResolvedValue();
    vi.mocked(MessageRelayPublisher.publishReplayComplete).mockResolvedValue();
    vi.mocked(MessageRelayPublisher.relayDirectMessage).mockResolvedValue('delivered');
  });

  it('fails expired queued messages through replayBacklog without relaying them', async () => {
    const expiredRecord: MessageRecord = {
      messageId: 'msg-expired-001',
      senderUserId: 'sender-user',
      senderDeviceId: 'sender-device',
      recipientUserId: 'recipient-user',
      recipientDeviceId: 'recipient-device',
      ciphertext: 'stale-encrypted-payload',
      deliveryState: 'accepted-queued',
      serverTimestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    };

    vi.mocked(MessageRepository.listQueuedMessages).mockResolvedValue([expiredRecord]);

    await replayBacklog(context);

    expect(MessageRepository.updateDeliveryState).toHaveBeenCalledWith(expiredRecord, 'failed');

    expect(MessageRelayPublisher.publishDeliveryStatus).toHaveBeenCalledWith(
      'sender-user',
      'sender-device',
      'msg-expired-001',
      'failed',
    );

    expect(MessageRelayPublisher.relayDirectMessage).not.toHaveBeenCalled();
    expect(MessageRelayPublisher.publishReplayComplete).toHaveBeenCalledWith(
      'recipient-user',
      'recipient-device',
      0,
    );
  });

  it('preserves queued messages within retention window', async () => {
    const recentRecord: MessageRecord = {
      messageId: 'msg-recent-001',
      senderUserId: 'sender-user',
      senderDeviceId: 'sender-device',
      recipientUserId: 'recipient-user',
      recipientDeviceId: 'recipient-device',
      ciphertext: 'payload',
      deliveryState: 'accepted-queued',
      serverTimestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const result = await checkRetentionPolicy(recentRecord);

    expect(result).toBe(false);
    expect(MessageRepository.updateDeliveryState).not.toHaveBeenCalled();
    expect(MessageRelayPublisher.publishDeliveryStatus).not.toHaveBeenCalled();
  });

  it('does not expire already-delivered messages regardless of age', async () => {
    const oldDelivered: MessageRecord = {
      messageId: 'msg-old-delivered',
      senderUserId: 'sender-user',
      senderDeviceId: 'sender-device',
      recipientUserId: 'recipient-user',
      recipientDeviceId: 'recipient-device',
      ciphertext: 'payload',
      deliveryState: 'delivered',
      serverTimestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const result = await checkRetentionPolicy(oldDelivered);

    expect(result).toBe(false);
    expect(MessageRepository.updateDeliveryState).not.toHaveBeenCalled();
  });

  it('does not expire already-failed messages', async () => {
    const alreadyFailed: MessageRecord = {
      messageId: 'msg-already-failed',
      senderUserId: 'sender-user',
      senderDeviceId: 'sender-device',
      recipientUserId: 'recipient-user',
      recipientDeviceId: 'recipient-device',
      ciphertext: 'payload',
      deliveryState: 'failed',
      serverTimestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const result = await checkRetentionPolicy(alreadyFailed);

    expect(result).toBe(false);
  });
});
