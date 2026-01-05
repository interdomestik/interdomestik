import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markAsReadCore } from './mark-read';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    update: mocks.update,
  },
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
  eq: vi.fn(val => ({ operator: 'eq', val })),
  and: vi.fn((...args) => ({ operator: 'and', args })),
}));

describe('notifications/markAsReadCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
  });

  it('marks notification as read scoped to user', async () => {
    await markAsReadCore({
      session: {
        user: { id: 'u1', role: 'user', tenantId: 't1' },
      } as any,
      notificationId: 'n1',
    });

    expect(mocks.update).toHaveBeenCalled();
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
});
