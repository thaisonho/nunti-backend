import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/messages/group-message-repository.js');
vi.mock('../../src/realtime/group-relay-publisher.js');
vi.mock('../../src/devices/device-service.js');

import * as GroupMessageRepository from '../../src/messages/group-message-repository.js';
import * as GroupRelayPublisher from '../../src/realtime/group-relay-publisher.js';
import * as DeviceService from '../../src/devices/device-service.js';
import { DeviceStatus } from '../../src/devices/device-model.js';
import { sendGroupMessage, replayGroupMessageBacklog } from '../../src/messages/group-message-service.js';
import type { WebSocketConnectionContext } from '../../src/auth/websocket-auth.js';

describe('groups fanout', () => {
  const context: WebSocketConnectionContext = {
    userId: 'sender-user',
    deviceId: 'sender-device',
    connectionId: 'conn-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recipient device fanout', () => {
    it('delivers to online recipient devices and queues for offline', async () => {
      vi.mocked(GroupMessageRepository.listGroupMemberUserIds).mockResolvedValue([
        'sender-user',
        'recipient-online',
        'recipient-offline',
      ]);
      vi.mocked(GroupMessageRepository.createGroupMessage).mockResolvedValue(null);
      vi.mocked(GroupMessageRepository.markGroupMessageProjectionDelivered).mockResolvedValue();

      vi.mocked(DeviceService.listDevices)
        .mockResolvedValueOnce([
          {
            userId: 'recipient-online',
            deviceId: 'device-online',
            status: DeviceStatus.TRUSTED,
            registeredAt: '2026-04-02T10:00:00.000Z',
            lastSeenAt: '2026-04-02T10:00:00.000Z',
          },
        ] as any)
        .mockResolvedValueOnce([
          {
            userId: 'recipient-offline',
            deviceId: 'device-offline',
            status: DeviceStatus.TRUSTED,
            registeredAt: '2026-04-02T10:00:00.000Z',
            lastSeenAt: '2026-04-02T10:00:00.000Z',
          },
        ] as any)
        .mockResolvedValueOnce([]); // No sender mirror devices

      vi.mocked(GroupRelayPublisher.publishGroupMessage)
        .mockResolvedValueOnce('delivered')
        .mockResolvedValueOnce('accepted-queued');
      vi.mocked(GroupRelayPublisher.publishGroupDeviceStatus).mockResolvedValue();

      const result = await sendGroupMessage(context, {
        groupMessageId: 'gmsg-fanout-1',
        groupId: 'group-1',
        ciphertext: 'payload',
      });

      expect(result.targetDeviceCount).toBe(2);

      // Verify status events sent to sender
      expect(GroupRelayPublisher.publishGroupDeviceStatus).toHaveBeenCalledTimes(2);

      // Check delivered status for online device
      const statusCalls = vi.mocked(GroupRelayPublisher.publishGroupDeviceStatus).mock.calls;
      const deliveredCall = statusCalls.find((c) => c[2].status === 'delivered');
      expect(deliveredCall).toBeDefined();
      expect(deliveredCall![2].recipientDeviceId).toBe('device-online');

      // Check accepted-queued status for offline device
      const queuedCall = statusCalls.find((c) => c[2].status === 'accepted-queued');
      expect(queuedCall).toBeDefined();
      expect(queuedCall![2].recipientDeviceId).toBe('device-offline');

      // Only delivered device should be marked
      expect(GroupMessageRepository.markGroupMessageProjectionDelivered).toHaveBeenCalledTimes(1);
    });

    it('skips revoked devices in fanout', async () => {
      vi.mocked(GroupMessageRepository.listGroupMemberUserIds).mockResolvedValue(['sender-user', 'recipient']);
      vi.mocked(GroupMessageRepository.createGroupMessage).mockResolvedValue(null);

      vi.mocked(DeviceService.listDevices)
        .mockResolvedValueOnce([
          {
            userId: 'recipient',
            deviceId: 'trusted-device',
            status: DeviceStatus.TRUSTED,
            registeredAt: '2026-04-02T10:00:00.000Z',
            lastSeenAt: '2026-04-02T10:00:00.000Z',
          },
          {
            userId: 'recipient',
            deviceId: 'revoked-device',
            status: DeviceStatus.REVOKED,
            registeredAt: '2026-04-02T10:00:00.000Z',
            lastSeenAt: '2026-04-02T10:00:00.000Z',
          },
        ] as any)
        .mockResolvedValueOnce([]); // No sender mirror

      vi.mocked(GroupRelayPublisher.publishGroupMessage).mockResolvedValue('delivered');
      vi.mocked(GroupRelayPublisher.publishGroupDeviceStatus).mockResolvedValue();
      vi.mocked(GroupMessageRepository.markGroupMessageProjectionDelivered).mockResolvedValue();

      const result = await sendGroupMessage(context, {
        groupMessageId: 'gmsg-skip-revoked',
        groupId: 'group-1',
        ciphertext: 'payload',
      });

      // Only trusted device should receive fanout
      expect(result.targetDeviceCount).toBe(1);
      expect(GroupRelayPublisher.publishGroupMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('sender mirror fanout', () => {
    it('fans out to sender other trusted devices with sender-sync audience', async () => {
      vi.mocked(GroupMessageRepository.listGroupMemberUserIds).mockResolvedValue(['sender-user', 'recipient']);
      vi.mocked(GroupMessageRepository.createGroupMessage).mockResolvedValue(null);
      vi.mocked(GroupMessageRepository.markGroupMessageProjectionDelivered).mockResolvedValue();

      vi.mocked(DeviceService.listDevices)
        .mockResolvedValueOnce([
          {
            userId: 'recipient',
            deviceId: 'recipient-device',
            status: DeviceStatus.TRUSTED,
            registeredAt: '2026-04-02T10:00:00.000Z',
            lastSeenAt: '2026-04-02T10:00:00.000Z',
          },
        ] as any)
        .mockResolvedValueOnce([
          {
            userId: 'sender-user',
            deviceId: 'sender-device', // This is the sending device - should be excluded
            status: DeviceStatus.TRUSTED,
            registeredAt: '2026-04-02T10:00:00.000Z',
            lastSeenAt: '2026-04-02T10:00:00.000Z',
          },
          {
            userId: 'sender-user',
            deviceId: 'sender-device-2', // This should get sender-sync
            status: DeviceStatus.TRUSTED,
            registeredAt: '2026-04-02T10:00:00.000Z',
            lastSeenAt: '2026-04-02T10:00:00.000Z',
          },
        ] as any);

      vi.mocked(GroupRelayPublisher.publishGroupMessage).mockResolvedValue('delivered');
      vi.mocked(GroupRelayPublisher.publishGroupDeviceStatus).mockResolvedValue();

      const result = await sendGroupMessage(context, {
        groupMessageId: 'gmsg-mirror',
        groupId: 'group-1',
        ciphertext: 'payload',
      });

      // 1 recipient device + 1 sender mirror device
      expect(result.targetDeviceCount).toBe(2);
      expect(GroupRelayPublisher.publishGroupMessage).toHaveBeenCalledTimes(2);

      // Check that sender-sync audience is used for mirror
      const publishCalls = vi.mocked(GroupRelayPublisher.publishGroupMessage).mock.calls;
      const mirrorCall = publishCalls.find((c) => c[1] === 'sender-device-2');
      expect(mirrorCall).toBeDefined();
      expect(mirrorCall![2].audience).toBe('sender-sync');

      // Check that recipient audience is used for recipient
      const recipientCall = publishCalls.find((c) => c[1] === 'recipient-device');
      expect(recipientCall).toBeDefined();
      expect(recipientCall![2].audience).toBe('recipient');
    });

    it('excludes the sending device from mirror fanout', async () => {
      vi.mocked(GroupMessageRepository.listGroupMemberUserIds).mockResolvedValue(['sender-user']);
      vi.mocked(GroupMessageRepository.createGroupMessage).mockResolvedValue(null);

      vi.mocked(DeviceService.listDevices)
        // No recipient devices to fan out
        .mockResolvedValueOnce([
          {
            userId: 'sender-user',
            deviceId: 'sender-device', // The actual sending device
            status: DeviceStatus.TRUSTED,
            registeredAt: '2026-04-02T10:00:00.000Z',
            lastSeenAt: '2026-04-02T10:00:00.000Z',
          },
        ] as any);

      vi.mocked(GroupRelayPublisher.publishGroupMessage).mockResolvedValue('delivered');
      vi.mocked(GroupRelayPublisher.publishGroupDeviceStatus).mockResolvedValue();

      const result = await sendGroupMessage(context, {
        groupMessageId: 'gmsg-no-self',
        groupId: 'group-1',
        ciphertext: 'payload',
      });

      // No fanout should happen (sender only, no mirrors)
      expect(result.targetDeviceCount).toBe(0);
      expect(GroupRelayPublisher.publishGroupMessage).not.toHaveBeenCalled();
    });
  });

  describe('reconnect replay', () => {
    it('replays queued group messages on reconnect and emits boundary', async () => {
      vi.mocked(GroupMessageRepository.listQueuedGroupMessages).mockResolvedValue([
        {
          projectionType: 'group-message',
          userId: 'recipient-user',
          deviceId: 'recipient-device',
          audience: 'recipient',
          delivered: false,
          groupMessageId: 'gmsg-queued-1',
          groupId: 'group-1',
          senderUserId: 'sender-user',
          senderDeviceId: 'sender-device',
          ciphertext: 'payload-1',
          recipientSnapshot: { userIds: ['recipient-user'], capturedAt: '2026-04-02T10:00:00.000Z' },
          serverTimestamp: '2026-04-02T10:00:00.000Z',
          createdAt: '2026-04-02T10:00:00.000Z',
        },
        {
          projectionType: 'group-message',
          userId: 'recipient-user',
          deviceId: 'recipient-device',
          audience: 'recipient',
          delivered: false,
          groupMessageId: 'gmsg-queued-2',
          groupId: 'group-1',
          senderUserId: 'sender-user',
          senderDeviceId: 'sender-device',
          ciphertext: 'payload-2',
          recipientSnapshot: { userIds: ['recipient-user'], capturedAt: '2026-04-02T10:01:00.000Z' },
          serverTimestamp: '2026-04-02T10:01:00.000Z',
          createdAt: '2026-04-02T10:01:00.000Z',
        },
      ]);

      vi.mocked(GroupRelayPublisher.publishGroupMessage)
        .mockResolvedValueOnce('delivered')
        .mockResolvedValueOnce('delivered');
      vi.mocked(GroupRelayPublisher.publishGroupMessageReplayComplete).mockResolvedValue();
      vi.mocked(GroupMessageRepository.markGroupMessageProjectionDelivered).mockResolvedValue();

      const replayContext: WebSocketConnectionContext = {
        userId: 'recipient-user',
        deviceId: 'recipient-device',
        connectionId: 'conn-replay',
      };

      await replayGroupMessageBacklog(replayContext);

      expect(GroupRelayPublisher.publishGroupMessage).toHaveBeenCalledTimes(2);
      expect(GroupMessageRepository.markGroupMessageProjectionDelivered).toHaveBeenCalledTimes(2);
      expect(GroupRelayPublisher.publishGroupMessageReplayComplete).toHaveBeenCalledWith(
        'recipient-user',
        'recipient-device',
        2,
      );
    });

    it('emits replay-complete boundary even when no queued messages', async () => {
      vi.mocked(GroupMessageRepository.listQueuedGroupMessages).mockResolvedValue([]);
      vi.mocked(GroupRelayPublisher.publishGroupMessageReplayComplete).mockResolvedValue();

      const replayContext: WebSocketConnectionContext = {
        userId: 'user-1',
        deviceId: 'device-1',
        connectionId: 'conn-1',
      };

      await replayGroupMessageBacklog(replayContext);

      expect(GroupRelayPublisher.publishGroupMessageReplayComplete).toHaveBeenCalledWith(
        'user-1',
        'device-1',
        0,
      );
    });
  });
});
