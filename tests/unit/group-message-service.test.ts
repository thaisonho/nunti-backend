import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/messages/group-message-repository.js');
vi.mock('../../src/realtime/group-relay-publisher.js');
vi.mock('../../src/devices/device-service.js');

import * as GroupMessageRepository from '../../src/messages/group-message-repository.js';
import * as GroupRelayPublisher from '../../src/realtime/group-relay-publisher.js';
import * as DeviceService from '../../src/devices/device-service.js';
import { DeviceStatus } from '../../src/devices/device-model.js';
import { processMembershipChange, replayMembershipBacklog } from '../../src/messages/group-message-service.js';
import type { WebSocketConnectionContext } from '../../src/auth/websocket-auth.js';

describe('group-message-service', () => {
  const context: WebSocketConnectionContext = {
    userId: 'actor-user',
    deviceId: 'actor-device',
    connectionId: 'conn-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(GroupMessageRepository.getGroupMember).mockResolvedValue({
      groupId: 'group-1',
      userId: 'actor-user',
      role: 'admin',
    });
    vi.mocked(GroupMessageRepository.allocateMembershipEventId).mockResolvedValue('mev-group-1-000000000001');
    vi.mocked(GroupMessageRepository.createMembershipEvent).mockResolvedValue();
    vi.mocked(GroupMessageRepository.markMembershipProjectionDelivered).mockResolvedValue();
    vi.mocked(GroupRelayPublisher.publishMembershipReplayComplete).mockResolvedValue();
  });

  it('fans out accepted membership event to all current members including actor', async () => {
    vi.mocked(GroupMessageRepository.addGroupMember).mockResolvedValue();
    vi.mocked(GroupMessageRepository.listGroupMemberUserIds).mockResolvedValue(['member-a', 'target-user']);

    vi.mocked(DeviceService.listDevices)
      .mockResolvedValueOnce([
        {
          userId: 'actor-user',
          deviceId: 'actor-device',
          status: DeviceStatus.TRUSTED,
          registeredAt: '2026-04-02T10:00:00.000Z',
          lastSeenAt: '2026-04-02T10:00:00.000Z',
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          userId: 'member-a',
          deviceId: 'member-device',
          status: DeviceStatus.TRUSTED,
          registeredAt: '2026-04-02T10:00:00.000Z',
          lastSeenAt: '2026-04-02T10:00:00.000Z',
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          userId: 'target-user',
          deviceId: 'target-device',
          status: DeviceStatus.REVOKED,
          registeredAt: '2026-04-02T10:00:00.000Z',
          lastSeenAt: '2026-04-02T10:00:00.000Z',
        },
      ] as any);

    vi.mocked(GroupRelayPublisher.publishMembershipEvent)
      .mockResolvedValueOnce('delivered')
      .mockResolvedValueOnce('accepted-queued');

    const result = await processMembershipChange(context, {
      requestId: 'req-1',
      groupId: 'group-1',
      changeType: 'member-joined',
      targetUserId: 'target-user',
    });

    expect(result.requestId).toBe('req-1');
    expect(result.eventId).toBe('mev-group-1-000000000001');
    expect(result.status).toBe('accepted');

    expect(GroupMessageRepository.addGroupMember).toHaveBeenCalledWith('group-1', 'target-user');
    expect(GroupMessageRepository.createMembershipEvent).toHaveBeenCalledOnce();

    const createCall = vi.mocked(GroupMessageRepository.createMembershipEvent).mock.calls[0];
    expect(createCall[1]).toEqual([
      { userId: 'actor-user', deviceId: 'actor-device' },
      { userId: 'member-a', deviceId: 'member-device' },
    ]);

    expect(GroupRelayPublisher.publishMembershipEvent).toHaveBeenCalledTimes(2);
    expect(GroupMessageRepository.markMembershipProjectionDelivered).toHaveBeenCalledTimes(1);
  });

  it('replays queued membership events in order and emits replay-complete boundary', async () => {
    vi.mocked(GroupMessageRepository.listQueuedMembershipEvents).mockResolvedValue([
      {
        eventType: 'group-membership-event',
        projectionType: 'membership-event',
        userId: 'actor-user',
        deviceId: 'actor-device',
        delivered: false,
        eventId: 'mev-group-1-0001',
        groupId: 'group-1',
        changeType: 'member-joined',
        actorUserId: 'actor-user',
        targetUserId: 'target-user',
        serverTimestamp: '2026-04-02T10:00:00.000Z',
      },
      {
        eventType: 'group-membership-event',
        projectionType: 'membership-event',
        userId: 'actor-user',
        deviceId: 'actor-device',
        delivered: false,
        eventId: 'mev-group-1-0002',
        groupId: 'group-1',
        changeType: 'member-left',
        actorUserId: 'actor-user',
        targetUserId: 'target-user',
        serverTimestamp: '2026-04-02T10:01:00.000Z',
      },
    ]);

    vi.mocked(GroupRelayPublisher.publishMembershipEvent)
      .mockResolvedValueOnce('delivered')
      .mockResolvedValueOnce('delivered');

    await replayMembershipBacklog(context);

    expect(GroupRelayPublisher.publishMembershipEvent).toHaveBeenCalledTimes(2);
    expect(GroupMessageRepository.markMembershipProjectionDelivered).toHaveBeenCalledTimes(2);
    expect(GroupRelayPublisher.publishMembershipReplayComplete).toHaveBeenCalledWith(
      'actor-user',
      'actor-device',
      2,
    );
  });

  it('throws AUTH_FORBIDDEN when actor is not a member of the group', async () => {
    vi.mocked(GroupMessageRepository.getGroupMember).mockResolvedValueOnce(null);

    await expect(processMembershipChange(context, {
      requestId: 'req-forbidden',
      groupId: 'group-1',
      changeType: 'member-joined',
      targetUserId: 'target-user',
    })).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
      statusCode: 403,
    });
  });
});
