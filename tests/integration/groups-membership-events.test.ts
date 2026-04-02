import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/messages/group-message-service.js');

import * as GroupMessageService from '../../src/messages/group-message-service.js';
import { handler } from '../../src/handlers/ws/group-membership.js';

describe('groups-membership-events (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns accepted membership-change result for valid commands', async () => {
    vi.mocked(GroupMessageService.processMembershipChange).mockResolvedValue({
      requestId: 'req-1',
      eventId: 'mev-group-1-0001',
      status: 'accepted',
      serverTimestamp: '2026-04-02T10:00:00.000Z',
    });

    const response = await handler({
      requestContext: {
        connectionId: 'conn-1',
        routeKey: 'group-membership',
        authorizer: {
          userId: 'actor-user',
          deviceId: 'actor-device',
        },
      },
      body: JSON.stringify({
        requestId: 'req-1',
        groupId: 'group-1',
        changeType: 'member-joined',
        targetUserId: 'target-user',
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      eventType: 'membership-change-result',
      requestId: 'req-1',
      eventId: 'mev-group-1-0001',
      status: 'accepted',
    });
  });

  it('returns structured validation errors with requestId', async () => {
    const response = await handler({
      requestContext: {
        connectionId: 'conn-1',
        routeKey: 'group-membership',
        authorizer: {
          userId: 'actor-user',
          deviceId: 'actor-device',
        },
      },
      body: JSON.stringify({
        requestId: 'req-2',
        groupId: 'group-1',
        changeType: 'bad-change',
        targetUserId: 'target-user',
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      eventType: 'error',
      code: 'VALIDATION_ERROR',
      message: 'Invalid membership command',
      requestId: 'req-2',
    });
  });

  it('returns structured internal errors with requestId on service failure', async () => {
    vi.mocked(GroupMessageService.processMembershipChange).mockRejectedValue(new Error('boom'));

    const response = await handler({
      requestContext: {
        connectionId: 'conn-1',
        routeKey: 'group-membership',
        authorizer: {
          userId: 'actor-user',
          deviceId: 'actor-device',
        },
      },
      body: JSON.stringify({
        requestId: 'req-3',
        groupId: 'group-1',
        changeType: 'member-joined',
        targetUserId: 'target-user',
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      eventType: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Membership command failed',
      requestId: 'req-3',
    });
  });
});
