import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { ddbDocClient } from '../../src/devices/device-repository.js';
import {
  allocateMembershipEventId,
  createMembershipEvent,
  listQueuedMembershipEvents,
  markMembershipProjectionDelivered,
} from '../../src/messages/group-message-repository.js';

describe('group-message-repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allocates monotonic eventId values from a group-local counter', async () => {
    vi.mocked(ddbDocClient.send).mockResolvedValue({
      Attributes: { sequence: 7 },
    } as any);

    const eventId = await allocateMembershipEventId('group-1');

    expect(eventId).toBe('mev-group-1-000000000007');
  });

  it('writes canonical event, timeline row, and per-device projections', async () => {
    vi.mocked(ddbDocClient.send).mockResolvedValue({} as any);

    await createMembershipEvent(
      {
        eventType: 'group-membership-event',
        eventId: 'mev-group-1-000000000001',
        groupId: 'group-1',
        changeType: 'member-joined',
        actorUserId: 'actor-1',
        targetUserId: 'target-1',
        serverTimestamp: '2026-04-02T10:00:00.000Z',
        createdAt: '2026-04-02T10:00:00.000Z',
      },
      [
        { userId: 'user-a', deviceId: 'device-a' },
        { userId: 'user-b', deviceId: 'device-b' },
      ],
    );

    expect(ddbDocClient.send).toHaveBeenCalledTimes(4);

    const canonicalPut = vi.mocked(ddbDocClient.send).mock.calls[0][0];
    expect((canonicalPut as any).input.Item.pk).toBe('GEVT#mev-group-1-000000000001');
    expect((canonicalPut as any).input.ConditionExpression).toContain('attribute_not_exists');

    const timelinePut = vi.mocked(ddbDocClient.send).mock.calls[1][0];
    expect((timelinePut as any).input.Item.pk).toBe('GROUP#group-1');
    expect((timelinePut as any).input.Item.sk).toBe('2026-04-02T10:00:00.000Z#mev-group-1-000000000001');

    const firstProjection = vi.mocked(ddbDocClient.send).mock.calls[2][0];
    expect((firstProjection as any).input.Item.pk).toBe('GINBOX#user-a#device-a');
    expect((firstProjection as any).input.Item.sk).toBe('2026-04-02T10:00:00.000Z#mev-group-1-000000000001');
  });

  it('queries queued membership events in oldest-first order', async () => {
    vi.mocked(ddbDocClient.send).mockResolvedValue({
      Items: [
        {
          pk: 'GINBOX#user-1#device-1',
          sk: '2026-04-02T10:00:00.000Z#mev-group-1-0001',
          projectionType: 'membership-event',
          userId: 'user-1',
          deviceId: 'device-1',
          delivered: false,
          eventId: 'mev-group-1-0001',
          groupId: 'group-1',
          changeType: 'member-joined',
          actorUserId: 'actor-1',
          targetUserId: 'target-1',
          serverTimestamp: '2026-04-02T10:00:00.000Z',
        },
      ],
    } as any);

    const items = await listQueuedMembershipEvents('user-1', 'device-1');

    expect(items).toHaveLength(1);
    expect(items[0].eventId).toBe('mev-group-1-0001');

    const queryCall = vi.mocked(ddbDocClient.send).mock.calls[0][0];
    expect((queryCall as any).input.ScanIndexForward).toBe(true);
    expect((queryCall as any).input.FilterExpression).toContain('delivered = :delivered');
  });

  it('marks projections delivered using deterministic key tuple', async () => {
    vi.mocked(ddbDocClient.send).mockResolvedValue({} as any);

    await markMembershipProjectionDelivered(
      'user-1',
      'device-1',
      '2026-04-02T10:00:00.000Z',
      'mev-group-1-0001',
    );

    const updateCall = vi.mocked(ddbDocClient.send).mock.calls[0][0];
    expect((updateCall as any).input.Key.pk).toBe('GINBOX#user-1#device-1');
    expect((updateCall as any).input.Key.sk).toBe('2026-04-02T10:00:00.000Z#mev-group-1-0001');
  });
});
