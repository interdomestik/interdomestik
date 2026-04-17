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
  agentClients: {
    memberId: 'agentClients.memberId',
    tenantId: 'agentClients.tenantId',
    agentId: 'agentClients.agentId',
    status: 'agentClients.status',
  },
  claimMessages: {
    id: 'claimMessages.id',
    claimId: 'claimMessages.claimId',
    readAt: 'claimMessages.readAt',
    tenantId: 'claimMessages.tenantId',
  },
  claims: {
    id: 'claims.id',
    branchId: 'claims.branchId',
    staffId: 'claims.staffId',
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
  or: vi.fn((...args) => ({ operator: 'or', args })),
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

  it('includes a scoped claim filter for staff reads', async () => {
    await markMessagesAsReadCore({
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 't1', branchId: 'branch-1' },
      } as any,
      messageIds: ['msg-1'],
    });

    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.where).toHaveBeenCalledTimes(2);

    const whereCall = mocks.where.mock.calls[1][0];
    const accessCondition = whereCall.args[1];
    expect(accessCondition.operator).toBe('inArray');
    expect(accessCondition.col).toBe('claimMessages.claimId');
  });

  it('includes a linked-client claim filter for agent reads', async () => {
    await markMessagesAsReadCore({
      session: {
        user: { id: 'agent-1', role: 'agent', tenantId: 't1' },
      } as any,
      messageIds: ['msg-1'],
    });

    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.where).toHaveBeenCalledTimes(3);
    expect(mocks.from.mock.calls[0][0]).toMatchObject({
      memberId: 'agentClients.memberId',
      tenantId: 'agentClients.tenantId',
    });
    expect(mocks.from.mock.calls[1][0]).toMatchObject({
      id: 'claims.id',
      userId: 'claims.userId',
    });
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
