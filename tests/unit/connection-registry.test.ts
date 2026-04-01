import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/devices/device-repository.js', () => ({
  ddbDocClient: { send: vi.fn() },
}));

vi.mock('../../src/app/config.js', () => ({
  getConfig: () => ({ devicesTableName: 'test-devices-table' }),
}));

import { ddbDocClient } from '../../src/devices/device-repository.js';
import {
  putConnection,
  listActiveConnections,
  listDeviceConnections,
  removeConnection,
} from '../../src/realtime/connection-registry.js';

describe('connection-registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('putConnection', () => {
    it('registers a device-aware connection record in DynamoDB', async () => {
      vi.mocked(ddbDocClient.send).mockResolvedValue({} as any);

      await putConnection('user-1', 'device-1', 'conn-abc');

      expect(ddbDocClient.send).toHaveBeenCalledTimes(1);
      const putCall = vi.mocked(ddbDocClient.send).mock.calls[0][0];
      expect((putCall as any).input.Item).toMatchObject({
        pk: 'CONNECTIONS#user-1',
        sk: 'CONNECTION#conn-abc',
        userId: 'user-1',
        deviceId: 'device-1',
        connectionId: 'conn-abc',
      });
    });

    it('stores the connection in the devices table', async () => {
      vi.mocked(ddbDocClient.send).mockResolvedValue({} as any);

      await putConnection('user-2', 'device-2', 'conn-xyz');

      const putCall = vi.mocked(ddbDocClient.send).mock.calls[0][0];
      expect((putCall as any).input.TableName).toBe('test-devices-table');
    });
  });

  describe('listActiveConnections', () => {
    it('returns all connections for a user with backward-compatible shape', async () => {
      vi.mocked(ddbDocClient.send).mockResolvedValue({
        Items: [
          { pk: 'CONNECTIONS#user-1', sk: 'CONNECTION#conn-1', userId: 'user-1', deviceId: 'dev-1', connectionId: 'conn-1' },
          { pk: 'CONNECTIONS#user-1', sk: 'CONNECTION#conn-2', userId: 'user-1', deviceId: 'dev-2', connectionId: 'conn-2' },
        ],
      } as any);

      const connections = await listActiveConnections('user-1');

      expect(connections).toHaveLength(2);
      // Must include userId and connectionId for backward compat with trust-change-publisher
      expect(connections[0]).toMatchObject({ userId: 'user-1', connectionId: 'conn-1' });
      expect(connections[1]).toMatchObject({ userId: 'user-1', connectionId: 'conn-2' });
    });

    it('returns empty array when no connections exist', async () => {
      vi.mocked(ddbDocClient.send).mockResolvedValue({ Items: [] } as any);

      const connections = await listActiveConnections('user-no-conns');

      expect(connections).toEqual([]);
    });

    it('skips malformed connection records gracefully', async () => {
      vi.mocked(ddbDocClient.send).mockResolvedValue({
        Items: [
          { pk: 'CONNECTIONS#user-1', sk: 'CONNECTION#conn-1', userId: 'user-1', deviceId: 'dev-1', connectionId: 'conn-1' },
          { pk: 'CONNECTIONS#user-1', sk: 'INVALID' },
        ],
      } as any);

      const connections = await listActiveConnections('user-1');

      expect(connections).toHaveLength(1);
    });
  });

  describe('listDeviceConnections', () => {
    it('returns only connections for the specified device', async () => {
      vi.mocked(ddbDocClient.send).mockResolvedValue({
        Items: [
          { pk: 'CONNECTIONS#user-1', sk: 'CONNECTION#conn-1', userId: 'user-1', deviceId: 'dev-1', connectionId: 'conn-1' },
          { pk: 'CONNECTIONS#user-1', sk: 'CONNECTION#conn-2', userId: 'user-1', deviceId: 'dev-2', connectionId: 'conn-2' },
          { pk: 'CONNECTIONS#user-1', sk: 'CONNECTION#conn-3', userId: 'user-1', deviceId: 'dev-1', connectionId: 'conn-3' },
        ],
      } as any);

      const connections = await listDeviceConnections('user-1', 'dev-1');

      expect(connections).toHaveLength(2);
      expect(connections.every(c => c.deviceId === 'dev-1')).toBe(true);
    });

    it('returns empty array when device has no active connections', async () => {
      vi.mocked(ddbDocClient.send).mockResolvedValue({
        Items: [
          { pk: 'CONNECTIONS#user-1', sk: 'CONNECTION#conn-1', userId: 'user-1', deviceId: 'dev-other', connectionId: 'conn-1' },
        ],
      } as any);

      const connections = await listDeviceConnections('user-1', 'dev-missing');

      expect(connections).toEqual([]);
    });
  });

  describe('removeConnection', () => {
    it('deletes a connection record by userId and connectionId', async () => {
      vi.mocked(ddbDocClient.send).mockResolvedValue({} as any);

      await removeConnection('user-1', 'conn-abc');

      expect(ddbDocClient.send).toHaveBeenCalledTimes(1);
      const deleteCall = vi.mocked(ddbDocClient.send).mock.calls[0][0];
      expect((deleteCall as any).input.Key).toEqual({
        pk: 'CONNECTIONS#user-1',
        sk: 'CONNECTION#conn-abc',
      });
    });
  });
});
