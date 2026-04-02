import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/messages/group-message-repository.js');
vi.mock('../../src/realtime/group-relay-publisher.js');
vi.mock('../../src/devices/device-service.js');

import * as GroupMessageRepository from '../../src/messages/group-message-repository.js';
import * as GroupRelayPublisher from '../../src/realtime/group-relay-publisher.js';
import * as DeviceService from '../../src/devices/device-service.js';
import { DeviceStatus } from '../../src/devices/device-model.js';
import { sendGroupMessage } from '../../src/messages/group-message-service.js';
import type { WebSocketConnectionContext } from '../../src/auth/websocket-auth.js';
import type { GroupMessageRecord } from '../../src/messages/group-message-model.js';

describe('groups idempotency', () => {
  const context: WebSocketConnectionContext = {
    userId: 'sender-user',
    deviceId: 'sender-device',
    connectionId: 'conn-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(GroupMessageRepository.listGroupMemberUserIds).mockResolvedValue([
      'sender-user',
      'recipient-a',
      'recipient-b',
    ]);
  });

  it('returns prior result and skips side effects on duplicate groupMessageId', async () => {
    const existingRecord: GroupMessageRecord = {
      groupMessageId: 'gmsg-123',
      groupId: 'group-1',
      senderUserId: 'sender-user',
      senderDeviceId: 'sender-device',
      ciphertext: 'encrypted-payload',
      recipientSnapshot: {
        userIds: ['recipient-a', 'recipient-b'],
        capturedAt: '2026-04-02T10:00:00.000Z',
      },
      serverTimestamp: '2026-04-02T10:00:00.000Z',
      createdAt: '2026-04-02T10:00:00.000Z',
    };

    // Mock that message already exists
    vi.mocked(GroupMessageRepository.createGroupMessage).mockResolvedValue(existingRecord);
    vi.mocked(DeviceService.listDevices).mockResolvedValue([
      {
        userId: 'recipient-a',
        deviceId: 'device-a',
        status: DeviceStatus.TRUSTED,
        registeredAt: '2026-04-02T10:00:00.000Z',
        lastSeenAt: '2026-04-02T10:00:00.000Z',
      } as any,
    ]);

    const result = await sendGroupMessage(context, {
      groupMessageId: 'gmsg-123',
      groupId: 'group-1',
      ciphertext: 'encrypted-payload',
    });

    expect(result.groupMessageId).toBe('gmsg-123');
    expect(result.status).toBe('accepted');
    expect(result.serverTimestamp).toBe('2026-04-02T10:00:00.000Z');

    // Verify no fanout side effects on duplicate
    expect(GroupRelayPublisher.publishGroupMessage).not.toHaveBeenCalled();
    expect(GroupRelayPublisher.publishGroupDeviceStatus).not.toHaveBeenCalled();
    expect(GroupMessageRepository.markGroupMessageProjectionDelivered).not.toHaveBeenCalled();
  });

  it('creates new message and fans out to all recipient devices on first send', async () => {
    // Mock that message does not exist (new message)
    vi.mocked(GroupMessageRepository.createGroupMessage).mockResolvedValue(null);
    vi.mocked(GroupMessageRepository.markGroupMessageProjectionDelivered).mockResolvedValue();

    vi.mocked(DeviceService.listDevices)
      .mockResolvedValueOnce([
        {
          userId: 'recipient-a',
          deviceId: 'device-a1',
          status: DeviceStatus.TRUSTED,
          registeredAt: '2026-04-02T10:00:00.000Z',
          lastSeenAt: '2026-04-02T10:00:00.000Z',
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          userId: 'recipient-b',
          deviceId: 'device-b1',
          status: DeviceStatus.TRUSTED,
          registeredAt: '2026-04-02T10:00:00.000Z',
          lastSeenAt: '2026-04-02T10:00:00.000Z',
        },
        {
          userId: 'recipient-b',
          deviceId: 'device-b2',
          status: DeviceStatus.REVOKED,
          registeredAt: '2026-04-02T10:00:00.000Z',
          lastSeenAt: '2026-04-02T10:00:00.000Z',
        },
      ] as any)
      // Sender devices (for mirror fanout)
      .mockResolvedValueOnce([
        {
          userId: 'sender-user',
          deviceId: 'sender-device',
          status: DeviceStatus.TRUSTED,
          registeredAt: '2026-04-02T10:00:00.000Z',
          lastSeenAt: '2026-04-02T10:00:00.000Z',
        },
        {
          userId: 'sender-user',
          deviceId: 'sender-device-2',
          status: DeviceStatus.TRUSTED,
          registeredAt: '2026-04-02T10:00:00.000Z',
          lastSeenAt: '2026-04-02T10:00:00.000Z',
        },
      ] as any);

    vi.mocked(GroupRelayPublisher.publishGroupMessage).mockResolvedValue('delivered');
    vi.mocked(GroupRelayPublisher.publishGroupDeviceStatus).mockResolvedValue();

    const result = await sendGroupMessage(context, {
      groupMessageId: 'gmsg-new',
      groupId: 'group-1',
      ciphertext: 'new-encrypted-payload',
    });

    expect(result.groupMessageId).toBe('gmsg-new');
    expect(result.status).toBe('accepted');
    expect(result.recipientUserCount).toBe(2);
    // 2 recipient devices (trusted) + 1 sender mirror device
    expect(result.targetDeviceCount).toBe(3);

    // Verify repository write was called
    expect(GroupMessageRepository.createGroupMessage).toHaveBeenCalledOnce();
    const createCall = vi.mocked(GroupMessageRepository.createGroupMessage).mock.calls[0];
    expect(createCall[0].groupMessageId).toBe('gmsg-new');
    expect(createCall[0].recipientSnapshot.userIds).toEqual(['recipient-a', 'recipient-b']);

    // Verify fanout to 3 devices (2 recipient + 1 sender mirror)
    expect(GroupRelayPublisher.publishGroupMessage).toHaveBeenCalledTimes(3);
    expect(GroupRelayPublisher.publishGroupDeviceStatus).toHaveBeenCalledTimes(3);
    expect(GroupMessageRepository.markGroupMessageProjectionDelivered).toHaveBeenCalledTimes(3);
  });

  it('excludes sender from recipient snapshot', async () => {
    vi.mocked(GroupMessageRepository.createGroupMessage).mockResolvedValue(null);
    vi.mocked(DeviceService.listDevices).mockResolvedValue([]);
    vi.mocked(GroupRelayPublisher.publishGroupMessage).mockResolvedValue('accepted-queued');

    await sendGroupMessage(context, {
      groupMessageId: 'gmsg-exclude-test',
      groupId: 'group-1',
      ciphertext: 'payload',
    });

    const createCall = vi.mocked(GroupMessageRepository.createGroupMessage).mock.calls[0];
    const recipientSnapshot = createCall[0].recipientSnapshot;

    // Sender should be excluded from recipients
    expect(recipientSnapshot.userIds).not.toContain('sender-user');
    expect(recipientSnapshot.userIds).toEqual(['recipient-a', 'recipient-b']);
  });
});
