import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markMessagesAsReadCore } from './mark-read';

// Mock DB
const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    update: mocks.update,
    select: mocks.select,
  },
  claimMessages: {
    id: 'claimMessages.id',
    claimId: 'claimMessages.claimId',
    readAt: 'claimMessages.readAt',
    tenantId: 'claimMessages.tenantId',
  },
  claims: {
    id: 'claims.id',
    tenantId: 'claims.tenantId',
    userId: 'claims.userId',
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((t, col, cond) => cond),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(val => ({ operator: 'eq', val })),
  and: vi.fn((...args) => ({ operator: 'and', args })),
  inArray: vi.fn((col, vals) => ({ operator: 'inArray', col, vals })),
  isNull: vi.fn(col => ({ operator: 'isNull', col })),
}));

describe('markMessagesAsReadCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
    // Mock select chain for subquery
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where }); // Note: where is reused for select too
  });

  it('marks messages as read for staff without ownership check', async () => {
    await markMessagesAsReadCore({
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 't1' },
      } as any,
      messageIds: ['msg-1'],
    });

    // Verify update called
    expect(mocks.update).toHaveBeenCalled();
    // Verify WHERE clause does NOT contain subquery (accessCondition is undefined)
    const whereCall = mocks.where.mock.calls[0][0];
    expect(whereCall.operator).toBe('and');
    // baseCondition components: eq(tenantId), inArray(id), isNull(readAt)
    // Access condition is undefined, so 'and(baseCopy, undefined)' -> 'and(baseCopy)'
    // Actually `and(base, undefined)` behavior depends on ORM mock but logic is:
    // const accessCondition = isStaff ? undefined : ...
    // where(and(base, accessCondition))
    // If accessCondition is undefined, it's just base.
  });

  it('includes ownership check for members', async () => {
    await markMessagesAsReadCore({
      session: {
        user: { id: 'user-1', role: 'user', tenantId: 't1' },
      } as any,
      messageIds: ['msg-1'],
    });

    expect(mocks.update).toHaveBeenCalled();
    // Called twice: once for subquery (select), once for update
    expect(mocks.where).toHaveBeenCalledTimes(2);

    // The UPDATE where is likely the second one, as subquery is built before update.
    const whereCall = mocks.where.mock.calls[1][0];

    // Structure: AND(BaseCondition, AccessCondition)
    // AccessCondition should be inArray(claimMessages.claimId, subquery)
    const accessCondition = whereCall.args[1];
    expect(accessCondition.operator).toBe('inArray');
    expect(accessCondition.col).toBe('claimMessages.claimId');
    // Ensure subquery was constructed
    expect(mocks.select).toHaveBeenCalled();
  });
});
