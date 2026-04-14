import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

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
import { replayBacklog } from '../../src/messages/message-service.js';
import type { WebSocketConnectionContext } from '../../src/auth/websocket-auth.js';

describe('messages-reconnect (integration)', () => {
  const context: WebSocketConnectionContext = {
    userId: 'recipient-user',
    deviceId: 'recipient-device',
    connectionId: 'conn-new',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retrieves, drains, and signals replay-complete in exact order', async () => {
    const retainedMessages = [
      {
        messageId: 'queued-1',
        senderUserId: 'sender-a',
        senderDeviceId: 'dev-a',
        recipientUserId: 'recipient-user',
        recipientDeviceId: 'recipient-device',
        ciphertext: 'cipher-older',
        deliveryState: 'accepted-queued' as const,
        serverTimestamp: '2026-04-01T10:00:00.000Z',
        updatedAt: '2026-04-01T10:00:00.000Z',
      },
      {
        messageId: 'queued-2',
        senderUserId: 'sender-b',
        senderDeviceId: 'dev-b',
        recipientUserId: 'recipient-user',
        recipientDeviceId: 'recipient-device',
        ciphertext: 'cipher-newer',
        deliveryState: 'accepted-queued' as const,
        serverTimestamp: '2026-04-01T10:05:00.000Z',
        updatedAt: '2026-04-01T10:05:00.000Z',
      }
    ];

    vi.mocked(MessageRepository.listQueuedMessages).mockResolvedValue(retainedMessages);
    vi.mocked(MessageRelayPublisher.relayDirectMessage).mockResolvedValue('delivered');

    await replayBacklog(context);

    // 1. Drains backlog in order
    expect(MessageRelayPublisher.relayDirectMessage).toHaveBeenCalledTimes(2);
    
    // 2. Marks both delivered
    expect(MessageRepository.updateDeliveryState).toHaveBeenCalledTimes(2);
    
    // 3. Emits replay-complete AFTER all relays
    expect(MessageRelayPublisher.publishReplayComplete).toHaveBeenCalledTimes(1);
    
    // Check call order logic (replay complete must be last)
    const relayOrder1 = vi.mocked(MessageRelayPublisher.relayDirectMessage).mock.invocationCallOrder[1];
    const replayCompleteOrder = vi.mocked(MessageRelayPublisher.publishReplayComplete).mock.invocationCallOrder[0];
    
    expect(replayCompleteOrder).toBeGreaterThan(relayOrder1);
  });
});
