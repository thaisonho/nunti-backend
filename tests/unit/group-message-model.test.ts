import { describe, expect, it } from 'vitest';
import {
  validateGroupMembershipCommandRequest,
  validateGroupMembershipEvent,
  buildMembershipProjectionSk,
  membershipChangeTypes,
} from '../../src/messages/group-message-model.js';

describe('group-message-model', () => {
  it('accepts all locked membership change types', () => {
    const requestBase = {
      requestId: 'req-1',
      groupId: 'group-1',
      targetUserId: 'user-target',
    };

    for (const changeType of membershipChangeTypes) {
      const parsed = validateGroupMembershipCommandRequest({
        ...requestBase,
        changeType,
      });

      expect(parsed.changeType).toBe(changeType);
    }
  });

  it('rejects invalid request payloads', () => {
    expect(() => validateGroupMembershipCommandRequest(null)).toThrow();
    expect(() => validateGroupMembershipCommandRequest({})).toThrow();
    expect(() => validateGroupMembershipCommandRequest({
      requestId: 'req-1',
      groupId: 'group-1',
      changeType: 'unsupported-change',
      targetUserId: 'user-target',
    })).toThrow();
  });

  it('rejects event payloads with missing ordering anchors', () => {
    expect(() => validateGroupMembershipEvent({
      eventType: 'group-membership-event',
      eventId: '',
      groupId: 'group-1',
      changeType: 'member-joined',
      actorUserId: 'user-actor',
      targetUserId: 'user-target',
      serverTimestamp: 'not-an-iso',
    })).toThrow();
  });

  it('builds projection sort keys with timestamp then eventId', () => {
    expect(buildMembershipProjectionSk('2026-04-02T10:00:00.000Z', 'mev-group-1-0001'))
      .toBe('2026-04-02T10:00:00.000Z#mev-group-1-0001');
  });
});
