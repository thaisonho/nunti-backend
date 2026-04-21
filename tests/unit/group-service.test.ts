import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/messages/group-message-repository.js');
vi.mock('../../src/messages/group-message-service.js');

import * as GroupRepository from '../../src/messages/group-message-repository.js';
import * as GroupMessageService from '../../src/messages/group-message-service.js';
import {
  addGroupMember,
  createGroup,
  getGroupDetails,
  leaveGroup,
  removeGroupMember,
} from '../../src/groups/group-service.js';

describe('group-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates group with owner and adds initial members without duplicates', async () => {
    vi.mocked(GroupRepository.createGroup).mockResolvedValue();
    vi.mocked(GroupMessageService.processMembershipChange).mockResolvedValue({
      requestId: 'req-1',
      eventId: 'event-1',
      status: 'accepted',
      serverTimestamp: '2026-04-21T10:00:00.000Z',
    });
    vi.mocked(GroupRepository.getGroup).mockResolvedValue({
      groupId: 'group-1',
      groupName: 'Core Team',
      createdByUserId: 'actor-user',
      createdAt: '2026-04-21T10:00:00.000Z',
      updatedAt: '2026-04-21T10:00:00.000Z',
    });
    vi.mocked(GroupRepository.getGroupMember).mockResolvedValue({
      groupId: 'group-1',
      userId: 'actor-user',
      role: 'owner',
      joinedAt: '2026-04-21T10:00:00.000Z',
    });
    vi.mocked(GroupRepository.listGroupMembers).mockResolvedValue([
      { groupId: 'group-1', userId: 'actor-user', role: 'owner' },
      { groupId: 'group-1', userId: 'member-a', role: 'member' },
      { groupId: 'group-1', userId: 'member-b', role: 'member' },
    ]);

    const result = await createGroup({
      actorUserId: 'actor-user',
      actorDeviceId: 'actor-device',
      groupId: 'group-1',
      groupName: 'Core Team',
      memberUserIds: ['member-a', 'member-a', 'actor-user', 'member-b'],
    });

    expect(GroupRepository.createGroup).toHaveBeenCalledOnce();
    expect(GroupMessageService.processMembershipChange).toHaveBeenCalledTimes(2);
    expect(result.members).toHaveLength(3);
  });

  it('returns AUTH_FORBIDDEN when actor is not a group member', async () => {
    vi.mocked(GroupRepository.getGroup).mockResolvedValue({
      groupId: 'group-1',
      createdByUserId: 'owner-user',
      createdAt: '2026-04-21T10:00:00.000Z',
      updatedAt: '2026-04-21T10:00:00.000Z',
    });
    vi.mocked(GroupRepository.getGroupMember).mockResolvedValue(null);

    await expect(getGroupDetails('actor-user', 'group-1')).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
      statusCode: 403,
    });
  });

  it('rejects add-member when target equals actor', async () => {
    await expect(addGroupMember('actor-user', 'actor-device', 'group-1', 'actor-user')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('rejects remove-member when target equals actor', async () => {
    await expect(removeGroupMember('actor-user', 'actor-device', 'group-1', 'actor-user')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('uses membership pipeline for leave operation', async () => {
    vi.mocked(GroupMessageService.processMembershipChange).mockResolvedValue({
      requestId: 'req-leave',
      eventId: 'event-leave',
      status: 'accepted',
      serverTimestamp: '2026-04-21T10:00:00.000Z',
    });

    const result = await leaveGroup('actor-user', 'actor-device', 'group-1');

    expect(result.groupId).toBe('group-1');
    expect(result.targetUserId).toBe('actor-user');
    expect(GroupMessageService.processMembershipChange).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        groupId: 'group-1',
        changeType: 'member-left',
        targetUserId: 'actor-user',
      }),
    );
  });
});
