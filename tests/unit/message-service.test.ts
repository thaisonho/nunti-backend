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
import type { DirectMessageRequest, DeliveryState } from '../../src/messages/message-model.js';

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
    vi.mocked(MessageRepository.createMessage).mockResolvedValue();
    vi.mocked(MessageRepository.updateDeliveryState).mockResolvedValue();
    vi.mocked(MessageRelayPublisher.publishDeliveryStatus).mockResolvedValue();
  });

  it('persists the message and relays to online recipient', async () => {
    vi.mocked(MessageRelayPublisher.relayDirectMessage).mockResolvedValue('delivered');

    const result = await sendMessage(senderContext, baseRequest);

    expect(result.messageId).toBe('msg-001');
    expect(result.status).toBe('delivered');
    expect(result.serverTimestamp).toBeDefined();

    // Verify persistence was called with correct record shape
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
    // If relay returns 'accepted' (same as initial state), no update needed
    vi.mocked(MessageRelayPublisher.relayDirectMessage).mockResolvedValue('accepted' as DeliveryState);

    await sendMessage(senderContext, baseRequest);

    expect(MessageRepository.updateDeliveryState).not.toHaveBeenCalled();
  });

  it('includes server timestamp in the result', async () => {
    vi.mocked(MessageRelayPublisher.relayDirectMessage).mockResolvedValue('delivered');

    const before = new Date().toISOString();
    const result = await sendMessage(senderContext, baseRequest);
    const after = new Date().toISOString();

    expect(result.serverTimestamp >= before).toBe(true);
    expect(result.serverTimestamp <= after).toBe(true);
  });
});
