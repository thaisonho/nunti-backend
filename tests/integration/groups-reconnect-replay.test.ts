import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/messages/message-service.js');
vi.mock('../../src/messages/group-message-service.js');

import * as MessageService from '../../src/messages/message-service.js';
import * as GroupMessageService from '../../src/messages/group-message-service.js';
import { handler } from '../../src/handlers/ws/reconnect.js';

describe('groups-reconnect-replay (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MessageService.replayBacklog).mockResolvedValue();
    vi.mocked(GroupMessageService.replayMembershipBacklog).mockResolvedValue();
    vi.mocked(GroupMessageService.replayGroupMessageBacklog).mockResolvedValue();
  });

  it('replays direct messages and membership events before returning success', async () => {
    const response = await handler({
      requestContext: {
        connectionId: 'conn-1',
        routeKey: 'reconnect',
        authorizer: {
          userId: 'user-1',
          deviceId: 'device-1',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(MessageService.replayBacklog).toHaveBeenCalledWith({
      userId: 'user-1',
      deviceId: 'device-1',
      connectionId: 'conn-1',
    });
    expect(GroupMessageService.replayMembershipBacklog).toHaveBeenCalledWith({
      userId: 'user-1',
      deviceId: 'device-1',
      connectionId: 'conn-1',
    });
    expect(GroupMessageService.replayGroupMessageBacklog).toHaveBeenCalledWith({
      userId: 'user-1',
      deviceId: 'device-1',
      connectionId: 'conn-1',
    });
  });
});
