import { describe, expect, it } from 'vitest';
import {
  validateGroupMembershipCommandRequest,
  validateGroupMembershipEvent,
  buildMembershipProjectionSk,
  membershipChangeTypes,
  validateGroupSendRequest,
  validateAttachmentEnvelope,
  buildGroupMessageProjectionSk,
  MAX_ATTACHMENT_BYTE_SIZE,
  MAX_ATTACHMENTS_PER_MESSAGE,
  ALLOWED_MIME_TYPES,
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

describe('group-send-model', () => {
  it('validates group send request without attachments', () => {
    const result = validateGroupSendRequest({
      groupMessageId: 'gmsg-1',
      groupId: 'group-1',
      ciphertext: 'encrypted-payload',
    });

    expect(result.groupMessageId).toBe('gmsg-1');
    expect(result.attachments).toBeUndefined();
  });

  it('validates group send request with valid attachments', () => {
    const result = validateGroupSendRequest({
      groupMessageId: 'gmsg-2',
      groupId: 'group-1',
      ciphertext: 'payload',
      attachments: [
        {
          attachmentId: 'att-1',
          storagePointer: 's3://bucket/file',
          mimeType: 'image/jpeg',
          byteSize: 1024,
          contentHash: 'a'.repeat(64),
        },
      ],
    });

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].mimeType).toBe('image/jpeg');
  });

  it('builds group message projection sort key', () => {
    expect(buildGroupMessageProjectionSk('2026-04-02T10:00:00.000Z', 'gmsg-123'))
      .toBe('2026-04-02T10:00:00.000Z#gmsg-123');
  });
});

describe('attachment-envelope-validation', () => {
  const validEnvelope = {
    attachmentId: 'att-1',
    storagePointer: 's3://bucket/path/file.jpg',
    mimeType: 'image/jpeg' as const,
    byteSize: 1024,
    contentHash: 'f'.repeat(64),
  };

  it('validates envelope with all required fields', () => {
    const result = validateAttachmentEnvelope(validEnvelope);
    expect(result.attachmentId).toBe('att-1');
  });

  it('validates envelope with optional fields', () => {
    const result = validateAttachmentEnvelope({
      ...validEnvelope,
      originalFileName: 'photo.jpg',
      thumbnailPointer: 's3://bucket/thumb.jpg',
    });
    expect(result.originalFileName).toBe('photo.jpg');
    expect(result.thumbnailPointer).toBe('s3://bucket/thumb.jpg');
  });

  it('rejects envelope exceeding byte size limit', () => {
    expect(() => validateAttachmentEnvelope({
      ...validEnvelope,
      byteSize: MAX_ATTACHMENT_BYTE_SIZE + 1,
    })).toThrow(/byteSize/);
  });

  it('rejects envelope with invalid contentHash', () => {
    expect(() => validateAttachmentEnvelope({
      ...validEnvelope,
      contentHash: 'invalid',
    })).toThrow(/contentHash/);
  });

  it('rejects envelope with unsupported MIME type', () => {
    expect(() => validateAttachmentEnvelope({
      ...validEnvelope,
      mimeType: 'application/octet-stream',
    })).toThrow(/mimeType/);
  });

  it('exports correct constants', () => {
    expect(MAX_ATTACHMENT_BYTE_SIZE).toBe(25 * 1024 * 1024);
    expect(MAX_ATTACHMENTS_PER_MESSAGE).toBe(10);
    expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
  });
});
