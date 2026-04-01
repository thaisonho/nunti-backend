import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as ConnectionRegistry from '../../src/realtime/connection-registry.js';
import { relayDirectMessage, publishDeliveryStatus } from '../../src/realtime/message-relay-publisher.js';
import type { DirectMessageEvent } from '../../src/messages/message-model.js';

vi.mock('../../src/realtime/connection-registry.js');

const sendSpy = vi.fn();

vi.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: class {
    send = sendSpy;
  },
  PostToConnectionCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

describe('message-relay-publisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendSpy.mockReset();
    process.env.WEBSOCKET_MANAGEMENT_ENDPOINT = 'https://ws.example.test';
  });

  describe('relayDirectMessage', () => {
    const sampleEvent: DirectMessageEvent = {
      eventType: 'direct-message',
      messageId: 'msg-001',
      senderUserId: 'sender-user',
      senderDeviceId: 'sender-device',
      recipientUserId: 'recipient-user',
      recipientDeviceId: 'recipient-device',
      ciphertext: 'encrypted-payload',
      serverTimestamp: '2026-04-01T10:00:00.000Z',
    };

    it('delivers message to recipient device and returns delivered', async () => {
      vi.mocked(ConnectionRegistry.listDeviceConnections).mockResolvedValue([
        { userId: 'recipient-user', deviceId: 'recipient-device', connectionId: 'conn-1' },
      ]);
      sendSpy.mockResolvedValue({});

      const result = await relayDirectMessage('recipient-user', 'recipient-device', sampleEvent);

      expect(result).toBe('delivered');
      expect(sendSpy).toHaveBeenCalledTimes(1);
    });

    it('returns accepted-queued when recipient device has no connections', async () => {
      vi.mocked(ConnectionRegistry.listDeviceConnections).mockResolvedValue([]);

      const result = await relayDirectMessage('recipient-user', 'recipient-device', sampleEvent);

      expect(result).toBe('accepted-queued');
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('removes stale connection on GoneException and returns accepted-queued', async () => {
      vi.mocked(ConnectionRegistry.listDeviceConnections).mockResolvedValue([
        { userId: 'recipient-user', deviceId: 'recipient-device', connectionId: 'stale-conn' },
      ]);
      vi.mocked(ConnectionRegistry.removeConnection).mockResolvedValue();
      sendSpy.mockRejectedValue({ name: 'GoneException' });

      const result = await relayDirectMessage('recipient-user', 'recipient-device', sampleEvent);

      expect(result).toBe('accepted-queued');
      expect(ConnectionRegistry.removeConnection).toHaveBeenCalledWith('recipient-user', 'stale-conn');
    });

    it('returns accepted-queued when WebSocket endpoint is not configured', async () => {
      delete process.env.WEBSOCKET_MANAGEMENT_ENDPOINT;

      const result = await relayDirectMessage('recipient-user', 'recipient-device', sampleEvent);

      expect(result).toBe('accepted-queued');
    });

    it('delivers to multiple connections and returns delivered if at least one succeeds', async () => {
      vi.mocked(ConnectionRegistry.listDeviceConnections).mockResolvedValue([
        { userId: 'recipient-user', deviceId: 'recipient-device', connectionId: 'conn-1' },
        { userId: 'recipient-user', deviceId: 'recipient-device', connectionId: 'conn-2' },
      ]);
      // First connection fails, second succeeds
      sendSpy
        .mockRejectedValueOnce({ name: 'TimeoutError' })
        .mockResolvedValueOnce({});

      const result = await relayDirectMessage('recipient-user', 'recipient-device', sampleEvent);

      expect(result).toBe('delivered');
    });
  });

  describe('publishDeliveryStatus', () => {
    it('sends delivery-status event to sender device', async () => {
      vi.mocked(ConnectionRegistry.listDeviceConnections).mockResolvedValue([
        { userId: 'sender-user', deviceId: 'sender-device', connectionId: 'sender-conn' },
      ]);
      sendSpy.mockResolvedValue({});

      await publishDeliveryStatus('sender-user', 'sender-device', 'msg-001', 'delivered');

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const postCommand = sendSpy.mock.calls[0][0];
      const body = JSON.parse(Buffer.from(postCommand.input.Data).toString());
      expect(body).toMatchObject({
        eventType: 'delivery-status',
        messageId: 'msg-001',
        status: 'delivered',
      });
    });

    it('removes stale sender connection on GoneException', async () => {
      vi.mocked(ConnectionRegistry.listDeviceConnections).mockResolvedValue([
        { userId: 'sender-user', deviceId: 'sender-device', connectionId: 'stale-conn' },
      ]);
      vi.mocked(ConnectionRegistry.removeConnection).mockResolvedValue();
      sendSpy.mockRejectedValue({ name: 'GoneException' });

      await publishDeliveryStatus('sender-user', 'sender-device', 'msg-001', 'delivered');

      expect(ConnectionRegistry.removeConnection).toHaveBeenCalledWith('sender-user', 'stale-conn');
    });

    it('does nothing when sender has no active connections', async () => {
      vi.mocked(ConnectionRegistry.listDeviceConnections).mockResolvedValue([]);

      await publishDeliveryStatus('sender-user', 'sender-device', 'msg-001', 'delivered');

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });
});
