import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler as createGroupHandler } from '../../src/handlers/http/groups-create.js';
import { handler as getGroupHandler } from '../../src/handlers/http/groups-get.js';
import { handler as listMembersHandler } from '../../src/handlers/http/groups-members-list.js';
import { handler as addMemberHandler } from '../../src/handlers/http/groups-members-add.js';
import { handler as removeMemberHandler } from '../../src/handlers/http/groups-members-remove.js';
import { handler as leaveGroupHandler } from '../../src/handlers/http/groups-leave.js';
import * as AuthContext from '../../src/handlers/http/http-auth-context.js';
import * as GroupService from '../../src/groups/group-service.js';

vi.mock('../../src/handlers/http/http-auth-context.js');
vi.mock('../../src/groups/group-service.js');

function createEvent(
  method: string,
  path: string,
  headers: Record<string, string>,
  body: Record<string, unknown> | null,
  pathParameters: Record<string, string> | null = null,
): APIGatewayProxyEvent {
  return {
    headers,
    body: body ? JSON.stringify(body) : null,
    httpMethod: method,
    isBase64Encoded: false,
    path,
    pathParameters,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: { requestId: 'test-req-id' } as any,
    resource: '',
  };
}

describe('Group HTTP Endpoints Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AuthContext.requireTrustedDeviceAuth).mockResolvedValue({
      user: { sub: 'actor-user', tokenUse: 'access' },
      deviceId: 'actor-device',
    });
  });

  it('POST /v1/groups creates a group and returns 201', async () => {
    vi.mocked(GroupService.createGroup).mockResolvedValue({
      groupId: 'group-1',
      groupName: 'Core Team',
      createdByUserId: 'actor-user',
      createdAt: '2026-04-21T10:00:00.000Z',
      updatedAt: '2026-04-21T10:00:00.000Z',
      members: [{ groupId: 'group-1', userId: 'actor-user', role: 'owner' }],
    });

    const event = createEvent(
      'POST',
      '/v1/groups',
      { Authorization: 'Bearer token', 'X-Device-Id': 'actor-device' },
      { groupName: 'Core Team', memberUserIds: ['member-a'] },
    );

    const response = await createGroupHandler(event);
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).data.groupId).toBe('group-1');
  });

  it('GET /v1/groups/{groupId} returns group details', async () => {
    vi.mocked(GroupService.getGroupDetails).mockResolvedValue({
      groupId: 'group-1',
      createdByUserId: 'actor-user',
      createdAt: '2026-04-21T10:00:00.000Z',
      updatedAt: '2026-04-21T10:00:00.000Z',
      members: [{ groupId: 'group-1', userId: 'actor-user', role: 'owner' }],
    });

    const event = createEvent(
      'GET',
      '/v1/groups/group-1',
      { Authorization: 'Bearer token', 'X-Device-Id': 'actor-device' },
      null,
      { groupId: 'group-1' },
    );

    const response = await getGroupHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data.groupId).toBe('group-1');
  });

  it('GET /v1/groups/{groupId}/members returns members', async () => {
    vi.mocked(GroupService.listGroupMembers).mockResolvedValue([
      { groupId: 'group-1', userId: 'actor-user', role: 'owner' },
      { groupId: 'group-1', userId: 'member-a', role: 'member' },
    ]);

    const event = createEvent(
      'GET',
      '/v1/groups/group-1/members',
      { Authorization: 'Bearer token', 'X-Device-Id': 'actor-device' },
      null,
      { groupId: 'group-1' },
    );

    const response = await listMembersHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data).toHaveLength(2);
  });

  it('POST /v1/groups/{groupId}/members validates body', async () => {
    const event = createEvent(
      'POST',
      '/v1/groups/group-1/members',
      { Authorization: 'Bearer token', 'X-Device-Id': 'actor-device' },
      {} as Record<string, unknown>,
      { groupId: 'group-1' },
    );

    const response = await addMemberHandler(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('DELETE /v1/groups/{groupId}/members/{userId} removes a member', async () => {
    vi.mocked(GroupService.removeGroupMember).mockResolvedValue({
      groupId: 'group-1',
      targetUserId: 'member-a',
      requestId: 'req-1',
      eventId: 'event-1',
      status: 'accepted',
      serverTimestamp: '2026-04-21T10:00:00.000Z',
    });

    const event = createEvent(
      'DELETE',
      '/v1/groups/group-1/members/member-a',
      { Authorization: 'Bearer token', 'X-Device-Id': 'actor-device' },
      null,
      { groupId: 'group-1', userId: 'member-a' },
    );

    const response = await removeMemberHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data.targetUserId).toBe('member-a');
  });

  it('POST /v1/groups/{groupId}/leave leaves group', async () => {
    vi.mocked(GroupService.leaveGroup).mockResolvedValue({
      groupId: 'group-1',
      targetUserId: 'actor-user',
      requestId: 'req-1',
      eventId: 'event-1',
      status: 'accepted',
      serverTimestamp: '2026-04-21T10:00:00.000Z',
    });

    const event = createEvent(
      'POST',
      '/v1/groups/group-1/leave',
      { Authorization: 'Bearer token', 'X-Device-Id': 'actor-device' },
      null,
      { groupId: 'group-1' },
    );

    const response = await leaveGroupHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data.targetUserId).toBe('actor-user');
  });
});
