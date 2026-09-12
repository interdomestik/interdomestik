import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markAllAsReadCore, markAsReadCore } from './mark-read';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((t, col, cond) => cond),
}));

vi.mock('@interdomestik/database/schema', () => ({
  notifications: {
    id: 'notifications.id',
    tenantId: 'notifications.tenantId',
    userId: 'notifications.userId',
    isRead: 'notifications.isRead',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column, value) => ({ operator: 'eq', column, value })),
  and: vi.fn((...args) => ({ operator: 'and', args })),
}));

describe('notifications/markAsReadCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ returning: mocks.returning });
    mocks.returning.mockResolvedValue([{ id: 'n1' }]);
    mocks.withTenantContext.mockImplementation((_context, action) =>
      action({ update: mocks.update })
    );
  });

  it('marks notification as read scoped to user', async () => {
    await markAsReadCore({
      session: {
        user: { id: 'u1', role: 'user', tenantId: 't1' },
      } as any,
      notificationId: 'n1',
    });

    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 't1', role: 'user' },
      expect.any(Function)
    );
    const whereCall = mocks.where.mock.calls[0][0];

    // Structure: withTenant(..., AND(eq(id), eq(userId))) -> mocked to AND(...)
    expect(whereCall.operator).toBe('and');
    const args = whereCall.args;
    // expect eq(id, n1) and eq(userId, u1)
    expect(args).toHaveLength(2);
    // Checking equality logic roughly
    // args[0] -> eq(id, n1) or eq(userId, u1) order depends on impl
  });

  it('throws if unauthorized', async () => {
    await expect(markAsReadCore({ session: null, notificationId: 'n1' })).rejects.toThrow(
      'Not authenticated'
    );
  });

  it('reports a failed acknowledgement when no notification row was updated', async () => {
    mocks.returning.mockResolvedValue([]);

    const result = await markAsReadCore({
      session: {
        user: { id: 'u1', role: 'user', tenantId: 't1' },
      } as any,
      notificationId: 'missing-notification',
    });

    expect(result).toEqual({ success: false, error: 'Notification not found' });
  });

  it('returns the notification IDs confirmed by a bulk acknowledgement', async () => {
    mocks.returning.mockResolvedValue([{ id: 'n1' }, { id: 'n2' }]);

    const result = await markAllAsReadCore({
      session: {
        user: { id: 'u1', role: 'user', tenantId: 't1' },
      } as any,
    });

    expect(result).toEqual({ success: true, notificationIds: ['n1', 'n2'] });
    expect(mocks.where).toHaveBeenCalledWith({
      operator: 'and',
      args: [
        { operator: 'eq', column: 'notifications.userId', value: 'u1' },
        { operator: 'eq', column: 'notifications.isRead', value: false },
      ],
    });
  });
});
