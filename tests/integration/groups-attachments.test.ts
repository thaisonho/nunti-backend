import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/messages/group-message-repository.js');
vi.mock('../../src/realtime/group-relay-publisher.js');
vi.mock('../../src/devices/device-service.js');

import * as GroupMessageRepository from '../../src/messages/group-message-repository.js';
import * as GroupRelayPublisher from '../../src/realtime/group-relay-publisher.js';
import * as DeviceService from '../../src/devices/device-service.js';
import { DeviceStatus } from '../../src/devices/device-model.js';
import { sendGroupMessage } from '../../src/messages/group-message-service.js';
import {
  validateGroupSendRequest,
  validateAttachmentEnvelope,
  MAX_ATTACHMENT_BYTE_SIZE,
  MAX_ATTACHMENTS_PER_MESSAGE,
  ALLOWED_MIME_TYPES,
  type AttachmentEnvelope,
} from '../../src/messages/group-message-model.js';
import type { WebSocketConnectionContext } from '../../src/auth/websocket-auth.js';

describe('groups attachments', () => {
  const context: WebSocketConnectionContext = {
    userId: 'sender-user',
    deviceId: 'sender-device',
    connectionId: 'conn-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(GroupMessageRepository.getGroupMember).mockResolvedValue({
      groupId: 'group-1',
      userId: 'sender-user',
      role: 'member',
    });
    vi.mocked(GroupMessageRepository.listGroupMemberUserIds).mockResolvedValue([
      'sender-user',
      'recipient-a',
    ]);
  });

  describe('attachment envelope validation', () => {
    const validAttachment: AttachmentEnvelope = {
      attachmentId: 'att-123',
      storagePointer: 's3://bucket/path/to/file.jpg',
      mimeType: 'image/jpeg',
      byteSize: 1024 * 1024, // 1 MiB
      contentHash: 'a'.repeat(64), // Valid SHA-256 (64 hex chars)
    };

    it('accepts valid attachment envelope with required fields', () => {
      const result = validateAttachmentEnvelope(validAttachment);
      expect(result.attachmentId).toBe('att-123');
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('accepts attachment envelope with optional fields', () => {
      const withOptional = {
        ...validAttachment,
        originalFileName: 'photo.jpg',
        thumbnailPointer: 's3://bucket/path/to/thumb.jpg',
      };
      const result = validateAttachmentEnvelope(withOptional);
      expect(result.originalFileName).toBe('photo.jpg');
      expect(result.thumbnailPointer).toBe('s3://bucket/path/to/thumb.jpg');
    });

    it('rejects attachment with missing required fields', () => {
      const missingId = { ...validAttachment };
      delete (missingId as any).attachmentId;
      expect(() => validateAttachmentEnvelope(missingId)).toThrow();

      const missingPointer = { ...validAttachment };
      delete (missingPointer as any).storagePointer;
      expect(() => validateAttachmentEnvelope(missingPointer)).toThrow();

      const missingMime = { ...validAttachment };
      delete (missingMime as any).mimeType;
      expect(() => validateAttachmentEnvelope(missingMime)).toThrow();

      const missingSize = { ...validAttachment };
      delete (missingSize as any).byteSize;
      expect(() => validateAttachmentEnvelope(missingSize)).toThrow();

      const missingHash = { ...validAttachment };
      delete (missingHash as any).contentHash;
      expect(() => validateAttachmentEnvelope(missingHash)).toThrow();
    });

    it('rejects attachment with empty required fields', () => {
      expect(() => validateAttachmentEnvelope({ ...validAttachment, attachmentId: '' })).toThrow();
      expect(() => validateAttachmentEnvelope({ ...validAttachment, storagePointer: '' })).toThrow();
      expect(() => validateAttachmentEnvelope({ ...validAttachment, contentHash: '' })).toThrow();
    });

    it('rejects attachment with invalid MIME type', () => {
      expect(() => validateAttachmentEnvelope({ ...validAttachment, mimeType: 'application/exe' })).toThrow(/mimeType/);
      expect(() => validateAttachmentEnvelope({ ...validAttachment, mimeType: 'video/avi' })).toThrow(/mimeType/);
    });

    it('accepts all allowed MIME types', () => {
      for (const mimeType of ALLOWED_MIME_TYPES) {
        const result = validateAttachmentEnvelope({ ...validAttachment, mimeType });
        expect(result.mimeType).toBe(mimeType);
      }
    });

    it('rejects attachment exceeding max byte size', () => {
      const tooBig = { ...validAttachment, byteSize: MAX_ATTACHMENT_BYTE_SIZE + 1 };
      expect(() => validateAttachmentEnvelope(tooBig)).toThrow(/byteSize/);
    });

    it('rejects attachment with zero or negative byte size', () => {
      expect(() => validateAttachmentEnvelope({ ...validAttachment, byteSize: 0 })).toThrow(/byteSize/);
      expect(() => validateAttachmentEnvelope({ ...validAttachment, byteSize: -1 })).toThrow(/byteSize/);
    });

    it('rejects attachment with non-integer byte size', () => {
      expect(() => validateAttachmentEnvelope({ ...validAttachment, byteSize: 1024.5 })).toThrow(/byteSize/);
    });

    it('rejects attachment with invalid contentHash format', () => {
      // Too short
      expect(() => validateAttachmentEnvelope({ ...validAttachment, contentHash: 'abc' })).toThrow(/contentHash/);
      // Too long
      expect(() => validateAttachmentEnvelope({ ...validAttachment, contentHash: 'a'.repeat(65) })).toThrow(/contentHash/);
      // Invalid characters
      expect(() => validateAttachmentEnvelope({ ...validAttachment, contentHash: 'g'.repeat(64) })).toThrow(/contentHash/);
    });

    it('rejects group send with more than max attachments', () => {
      const tooManyAttachments = Array(MAX_ATTACHMENTS_PER_MESSAGE + 1).fill(validAttachment);
      expect(() =>
        validateGroupSendRequest({
          groupMessageId: 'gmsg-1',
          groupId: 'group-1',
          ciphertext: 'payload',
          attachments: tooManyAttachments,
        }),
      ).toThrow(/Maximum.*attachments/);
    });

    it('accepts group send with max attachments', () => {
      const maxAttachments = Array(MAX_ATTACHMENTS_PER_MESSAGE).fill(validAttachment);
      const result = validateGroupSendRequest({
        groupMessageId: 'gmsg-1',
        groupId: 'group-1',
        ciphertext: 'payload',
        attachments: maxAttachments,
      });
      expect(result.attachments).toHaveLength(MAX_ATTACHMENTS_PER_MESSAGE);
    });
  });

  describe('attachment envelope transport', () => {
    const validAttachment: AttachmentEnvelope = {
      attachmentId: 'att-transport-1',
      storagePointer: 's3://bucket/path/file.jpg',
      mimeType: 'image/jpeg',
      byteSize: 2048,
      contentHash: 'b'.repeat(64),
    };

    it('persists attachment metadata in canonical record', async () => {
      vi.mocked(GroupMessageRepository.createGroupMessage).mockResolvedValue(null);
      vi.mocked(DeviceService.listDevices).mockResolvedValue([]);
      vi.mocked(GroupRelayPublisher.publishGroupMessage).mockResolvedValue('accepted-queued');
      vi.mocked(GroupRelayPublisher.publishGroupDeviceStatus).mockResolvedValue();

      await sendGroupMessage(context, {
        groupMessageId: 'gmsg-attach-1',
        groupId: 'group-1',
        ciphertext: 'payload',
        attachments: [validAttachment],
      });

      const createCall = vi.mocked(GroupMessageRepository.createGroupMessage).mock.calls[0];
      const record = createCall[0];

      expect(record.attachments).toBeDefined();
      expect(record.attachments).toHaveLength(1);
      expect(record.attachments![0].attachmentId).toBe('att-transport-1');
      expect(record.attachments![0].mimeType).toBe('image/jpeg');
    });

    it('includes attachment metadata in fanout event', async () => {
      vi.mocked(GroupMessageRepository.createGroupMessage).mockResolvedValue(null);
      vi.mocked(GroupMessageRepository.markGroupMessageProjectionDelivered).mockResolvedValue();
      vi.mocked(DeviceService.listDevices)
        .mockResolvedValueOnce([
          {
            userId: 'recipient-a',
            deviceId: 'device-a',
            status: DeviceStatus.TRUSTED,
            registeredAt: '2026-04-02T10:00:00.000Z',
            lastSeenAt: '2026-04-02T10:00:00.000Z',
          },
        ] as any)
        .mockResolvedValueOnce([]); // No sender mirror devices

      vi.mocked(GroupRelayPublisher.publishGroupMessage).mockResolvedValue('delivered');
      vi.mocked(GroupRelayPublisher.publishGroupDeviceStatus).mockResolvedValue();

      await sendGroupMessage(context, {
        groupMessageId: 'gmsg-attach-2',
        groupId: 'group-1',
        ciphertext: 'payload',
        attachments: [validAttachment, { ...validAttachment, attachmentId: 'att-2' }],
      });

      const publishCall = vi.mocked(GroupRelayPublisher.publishGroupMessage).mock.calls[0];
      const event = publishCall[2];

      expect(event.attachments).toBeDefined();
      expect(event.attachments).toHaveLength(2);
      expect(event.attachments![0].attachmentId).toBe('att-transport-1');
      expect(event.attachments![1].attachmentId).toBe('att-2');
    });

    it('omits attachments field when no attachments present', async () => {
      vi.mocked(GroupMessageRepository.createGroupMessage).mockResolvedValue(null);
      vi.mocked(DeviceService.listDevices)
        .mockResolvedValueOnce([
          {
            userId: 'recipient-a',
            deviceId: 'device-a',
            status: DeviceStatus.TRUSTED,
            registeredAt: '2026-04-02T10:00:00.000Z',
            lastSeenAt: '2026-04-02T10:00:00.000Z',
          },
        ] as any)
        .mockResolvedValueOnce([]);

      vi.mocked(GroupRelayPublisher.publishGroupMessage).mockResolvedValue('delivered');
      vi.mocked(GroupRelayPublisher.publishGroupDeviceStatus).mockResolvedValue();
      vi.mocked(GroupMessageRepository.markGroupMessageProjectionDelivered).mockResolvedValue();

      await sendGroupMessage(context, {
        groupMessageId: 'gmsg-no-attach',
        groupId: 'group-1',
        ciphertext: 'payload',
      });

      const createCall = vi.mocked(GroupMessageRepository.createGroupMessage).mock.calls[0];
      expect(createCall[0].attachments).toBeUndefined();

      const publishCall = vi.mocked(GroupRelayPublisher.publishGroupMessage).mock.calls[0];
      expect(publishCall[2].attachments).toBeUndefined();
    });

    it('preserves per-device status behavior for attachment messages', async () => {
      vi.mocked(GroupMessageRepository.createGroupMessage).mockResolvedValue(null);
      vi.mocked(GroupMessageRepository.markGroupMessageProjectionDelivered).mockResolvedValue();
      vi.mocked(DeviceService.listDevices)
        .mockResolvedValueOnce([
          {
            userId: 'recipient-a',
            deviceId: 'device-a',
            status: DeviceStatus.TRUSTED,
            registeredAt: '2026-04-02T10:00:00.000Z',
            lastSeenAt: '2026-04-02T10:00:00.000Z',
          },
        ] as any)
        .mockResolvedValueOnce([]);

      vi.mocked(GroupRelayPublisher.publishGroupMessage).mockResolvedValue('delivered');
      vi.mocked(GroupRelayPublisher.publishGroupDeviceStatus).mockResolvedValue();

      const result = await sendGroupMessage(context, {
        groupMessageId: 'gmsg-attach-status',
        groupId: 'group-1',
        ciphertext: 'payload',
        attachments: [validAttachment],
      });

      expect(result.status).toBe('accepted');
      expect(GroupRelayPublisher.publishGroupDeviceStatus).toHaveBeenCalledOnce();

      const statusCall = vi.mocked(GroupRelayPublisher.publishGroupDeviceStatus).mock.calls[0];
      expect(statusCall[2].status).toBe('delivered');
    });
  });

  describe('handler error responses', () => {
    it('returns validation error with requestId for invalid attachment', async () => {
      // We need to test the handler directly
      const { handler } = await import('../../src/handlers/ws/group-messages.js');

      const event = {
        requestContext: {
          connectionId: 'conn-1',
          routeKey: 'groupSend',
          authorizer: { userId: 'user-1', deviceId: 'device-1' },
        },
        body: JSON.stringify({
          groupMessageId: 'gmsg-invalid-attach',
          groupId: 'group-1',
          ciphertext: 'payload',
          attachments: [
            {
              attachmentId: 'att-1',
              storagePointer: 's3://bucket/file',
              mimeType: 'application/exe', // Invalid MIME type
              byteSize: 1024,
              contentHash: 'a'.repeat(64),
            },
          ],
        }),
      };

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(body.eventType).toBe('error');
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.requestId).toBe('gmsg-invalid-attach');
      expect(body.message).toContain('mimeType');
    });

    it('returns AUTH_FORBIDDEN when sender is not a group member', async () => {
      const { handler } = await import('../../src/handlers/ws/group-messages.js');

      vi.mocked(GroupMessageRepository.getGroupMember).mockResolvedValueOnce(null);

      const event = {
        requestContext: {
          connectionId: 'conn-1',
          routeKey: 'groupSend',
          authorizer: { userId: 'user-1', deviceId: 'device-1' },
        },
        body: JSON.stringify({
          groupMessageId: 'gmsg-forbidden',
          groupId: 'group-1',
          ciphertext: 'payload',
        }),
      };

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(body.eventType).toBe('error');
      expect(body.code).toBe('AUTH_FORBIDDEN');
      expect(body.message).toBe('Forbidden group send');
      expect(body.requestId).toBe('gmsg-forbidden');
    });
  });
});
