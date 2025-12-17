import './messages.test.base';
import { beforeEach, describe, expect, it } from 'vitest';
import { markMessagesAsRead } from './messages';
import { mocks, resetMocks } from './messages.test.base';

describe('markMessagesAsRead', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should fail if user is not authenticated', async () => {
    mocks.getSession.mockResolvedValue(null);

    const result = await markMessagesAsRead(['msg-1', 'msg-2']);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('should succeed with empty message list', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123' } });

    const result = await markMessagesAsRead([]);

    expect(result).toEqual({ success: true });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it('should update messages as read', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123' } });
    mocks.dbUpdate.mockResolvedValue(undefined);

    const result = await markMessagesAsRead(['msg-1', 'msg-2']);

    expect(result).toEqual({ success: true });
    expect(mocks.dbUpdate).toHaveBeenCalledTimes(2);
  });

  it('should handle database errors gracefully', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123' } });
    mocks.dbUpdate.mockRejectedValue(new Error('DB Error'));

    const result = await markMessagesAsRead(['msg-1']);

    expect(result).toEqual({ success: false, error: 'Failed to mark messages as read' });
  });
});
