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
  createMessage,
  getMessage,
  updateDeliveryState,
} from '../../src/messages/message-repository.js';
import type { MessageRecord } from '../../src/messages/message-model.js';

describe('message-repository', () => {
  const baseRecord: MessageRecord = {
    messageId: 'msg-001',
    senderUserId: 'sender-user',
    senderDeviceId: 'sender-device',
    recipientUserId: 'recipient-user',
    recipientDeviceId: 'recipient-device',
    ciphertext: 'encrypted-payload',
    deliveryState: 'accepted',
    serverTimestamp: '2026-04-01T10:00:00.000Z',
    updatedAt: '2026-04-01T10:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMessage (idempotent)', () => {
    it('stores a new message with conditional write to prevent duplicates', async () => {
      vi.mocked(ddbDocClient.send).mockResolvedValue({} as any);

      await createMessage(baseRecord);

      // The first call should be the MSG record with ConditionExpression
      const msgCall = vi.mocked(ddbDocClient.send).mock.calls[0][0];
      expect((msgCall as any).input.ConditionExpression).toBeDefined();
      expect((msgCall as any).input.ConditionExpression).toContain('attribute_not_exists');
    });

    it('returns the existing record when messageId already exists', async () => {
      const existingRecord = { ...baseRecord, deliveryState: 'delivered' as const };
      const conditionError = Object.assign(new Error('Conditional'), {
        name: 'ConditionalCheckFailedException',
      });

      // First PutCommand fails (duplicate), then GetCommand returns existing
      vi.mocked(ddbDocClient.send)
        .mockRejectedValueOnce(conditionError)
        .mockResolvedValueOnce({
          Item: {
            pk: 'MSG#msg-001',
            sk: 'MSG#msg-001',
            ...existingRecord,
          },
        } as any);

      const result = await createMessage(baseRecord);

      expect(result).toBeDefined();
      expect(result!.messageId).toBe('msg-001');
      expect(result!.deliveryState).toBe('delivered');
    });

    it('creates both MSG and INBOX records for a new message', async () => {
      vi.mocked(ddbDocClient.send).mockResolvedValue({} as any);

      await createMessage(baseRecord);

      // Should have MSG PutCommand and INBOX PutCommand
      expect(ddbDocClient.send).toHaveBeenCalledTimes(2);
      const inboxCall = vi.mocked(ddbDocClient.send).mock.calls[1][0];
      expect((inboxCall as any).input.Item.pk).toContain('INBOX#');
    });

    it('skips INBOX creation when message is a duplicate', async () => {
      const conditionError = Object.assign(new Error('Conditional'), {
        name: 'ConditionalCheckFailedException',
      });

      vi.mocked(ddbDocClient.send)
        .mockRejectedValueOnce(conditionError)
        .mockResolvedValueOnce({
          Item: { pk: 'MSG#msg-001', sk: 'MSG#msg-001', ...baseRecord },
        } as any);

      await createMessage(baseRecord);

      // Only 2 calls: failed PutCommand + GetCommand to read existing
      // No INBOX PutCommand because duplicate was detected
      expect(ddbDocClient.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMessage', () => {
    it('retrieves message by messageId', async () => {
      vi.mocked(ddbDocClient.send).mockResolvedValue({
        Item: { pk: 'MSG#msg-001', sk: 'MSG#msg-001', ...baseRecord },
      } as any);

      const result = await getMessage('msg-001');

      expect(result).toBeDefined();
      expect(result!.messageId).toBe('msg-001');
    });

    it('returns null when message does not exist', async () => {
      vi.mocked(ddbDocClient.send).mockResolvedValue({} as any);

      const result = await getMessage('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateDeliveryState', () => {
    it('updates both MSG and INBOX records', async () => {
      vi.mocked(ddbDocClient.send).mockResolvedValue({} as any);

      await updateDeliveryState(baseRecord, 'delivered');

      expect(ddbDocClient.send).toHaveBeenCalledTimes(2);
    });
  });
});
