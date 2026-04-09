import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/messages/message-repository.js');
vi.mock('../../src/realtime/message-relay-publisher.js');

import * as MessageRepository from '../../src/messages/message-repository.js';
import * as MessageRelayPublisher from '../../src/realtime/message-relay-publisher.js';
import { replayBacklog } from '../../src/messages/message-service.js';
import type { MessageRecord, DeliveryState } from '../../src/messages/message-model.js';
import type { WebSocketConnectionContext } from '../../src/auth/websocket-auth.js';

describe('message-replay', () => {
  const context: WebSocketConnectionContext = {
    userId: 'recipient-user',
    deviceId: 'recipient-device',
    connectionId: 'conn-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drains empty backlog and emits replay-complete with 0 count', async () => {
    vi.mocked(MessageRepository.listQueuedMessages).mockResolvedValue([]);
    
    await replayBacklog(context);

    expect(MessageRepository.listQueuedMessages).toHaveBeenCalledWith('recipient-user', 'recipient-device');
    expect(MessageRelayPublisher.relayDirectMessage).not.toHaveBeenCalled();
    expect(MessageRelayPublisher.publishReplayComplete).toHaveBeenCalledWith(
      'recipient-user',
      'recipient-device',
      0
    );
  });

  it('delivers queued messages in order and updates state', async () => {
    const queued: MessageRecord[] = [
      {
        messageId: 'msg-older',
        senderUserId: 'sender-1',
        senderDeviceId: 'dev-1',
        recipientUserId: 'recipient-user',
        recipientDeviceId: 'recipient-device',
        ciphertext: 'cipher-1',
        deliveryState: 'accepted-queued',
        serverTimestamp: '2026-04-01T10:00:00.000Z',
        updatedAt: '2026-04-01T10:00:00.000Z',
      },
      {
        messageId: 'msg-newer',
        senderUserId: 'sender-2',
        senderDeviceId: 'dev-2',
        recipientUserId: 'recipient-user',
        recipientDeviceId: 'recipient-device',
        ciphertext: 'cipher-2',
        deliveryState: 'accepted-queued',
        serverTimestamp: '2026-04-01T10:05:00.000Z',
        updatedAt: '2026-04-01T10:05:00.000Z',
      }
    ];

    vi.mocked(MessageRepository.listQueuedMessages).mockResolvedValue(queued);
    vi.mocked(MessageRelayPublisher.relayDirectMessage).mockResolvedValue('delivered');

    await replayBacklog(context);

    // Relay must be called twice in order
    expect(MessageRelayPublisher.relayDirectMessage).toHaveBeenCalledTimes(2);
    expect(MessageRelayPublisher.relayDirectMessage).toHaveBeenNthCalledWith(
      1,
      'recipient-user',
      'recipient-device',
      expect.objectContaining({ messageId: 'msg-older' })
    );
    expect(MessageRelayPublisher.relayDirectMessage).toHaveBeenNthCalledWith(
      2,
      'recipient-user',
      'recipient-device',
      expect.objectContaining({ messageId: 'msg-newer' })
    );

    // State updates must occur for successfully delivered
    expect(MessageRepository.updateDeliveryState).toHaveBeenCalledTimes(2);
    expect(MessageRepository.updateDeliveryState).toHaveBeenNthCalledWith(
      1,
      queued[0],
      'delivered'
    );
    
    // Sender gets delivery-status event
    expect(MessageRelayPublisher.publishDeliveryStatus).toHaveBeenCalledTimes(2);

    // Finally emit replay-complete
    expect(MessageRelayPublisher.publishReplayComplete).toHaveBeenCalledWith(
      'recipient-user',
      'recipient-device',
      2
    );
  });

  it('leaves message queued if relay fails during replay', async () => {
    const queued: MessageRecord[] = [
      {
        messageId: 'msg-fail',
        senderUserId: 'sender-1',
        senderDeviceId: 'dev-1',
        recipientUserId: 'recipient-user',
        recipientDeviceId: 'recipient-device',
        ciphertext: 'cipher-1',
        deliveryState: 'accepted-queued',
        serverTimestamp: '2026-04-01T10:00:00.000Z',
        updatedAt: '2026-04-01T10:00:00.000Z',
      }
    ];

    vi.mocked(MessageRepository.listQueuedMessages).mockResolvedValue(queued);
    // Simulate connection drop during replay
    vi.mocked(MessageRelayPublisher.relayDirectMessage).mockResolvedValue('accepted-queued');

    await replayBacklog(context);

    // Delivery-state should not be updated since we remain in accepted-queued
    expect(MessageRepository.updateDeliveryState).not.toHaveBeenCalled();
    // Replay complete should still emit with count of 0 (successfully replayed)
    expect(MessageRelayPublisher.publishReplayComplete).toHaveBeenCalledWith(
      'recipient-user',
      'recipient-device',
      0
    );
  });
});
