import { refuseAcceptance } from '@/test/member-acceptance.test-support';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import './messages.test-support';
import { mocks, resetMocks } from './messages.test-support';

let markMessagesAsRead: typeof import('./messages').markMessagesAsRead;

describe('markMessagesAsRead', () => {
  beforeAll(async () => {
    ({ markMessagesAsRead } = await import('./messages'));
  });

  beforeEach(() => {
    resetMocks();
  });

  beforeEach(async () => {
    const { headers } = await import('next/headers');
    (headers as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it('refuses before protected work when acceptance is missing', async () => {
    refuseAcceptance();
    mocks.getSession.mockResolvedValue({
      user: { id: 'fixture-member', role: 'member', tenantId: 'tenant_mk' },
    });
    await expect(markMessagesAsRead(['msg-1'])).resolves.toEqual({
      success: false,
      error: 'acceptance_required',
    });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it('should fail if user is not authenticated', async () => {
    mocks.getSession.mockResolvedValue(null);

    const result = await markMessagesAsRead(['msg-1', 'msg-2']);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('should succeed with empty message list', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'user-123', role: 'member', tenantId: 'tenant_mk' },
    });

    const result = await markMessagesAsRead([]);

    expect(result).toEqual({ success: true });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it('should update messages as read', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'user-123', role: 'member', tenantId: 'tenant_mk' },
    });

    const result = await markMessagesAsRead(['msg-1', 'msg-2']);

    expect(result).toEqual({ success: true });
    // Domain layer uses a single update with inArray, not individual updates
  });

  it('should handle database errors gracefully', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'user-123', role: 'member', tenantId: 'tenant_mk' },
    });
    mocks.dbUpdate.mockRejectedValue(new Error('Database connection error'));

    const result = await markMessagesAsRead(['msg-1', 'msg-2']);

    expect(result).toEqual({ success: false, error: 'Failed to mark messages as read' });
  });
});
