import { beforeEach, describe, expect, it, vi } from 'vitest';

type Predicate =
  | { op: 'and' | 'or'; conditions: Predicate[] }
  | { op: 'eq' | 'ne'; column: string; value: unknown }
  | { op: 'inArray'; column: string; values: unknown }
  | { op: 'isNull'; column: string };

type CompoundPredicate = Extract<Predicate, { conditions: Predicate[] }>;

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  subqueryWhere: vi.fn(),
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
    isInternal: 'claimMessages.isInternal',
    readAt: 'claimMessages.readAt',
    senderId: 'claimMessages.senderId',
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

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn((session: { user: { tenantId: string } }) => session.user.tenantId),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column, value) => ({ op: 'eq', column, value })),
  ne: vi.fn((column, value) => ({ op: 'ne', column, value })),
  and: vi.fn((...conditions) => ({
    op: 'and',
    conditions: conditions.filter(Boolean),
  })),
  inArray: vi.fn((column, values) => ({ op: 'inArray', column, values })),
  isNull: vi.fn(column => ({ op: 'isNull', column })),
  or: vi.fn((...conditions) => ({
    op: 'or',
    conditions: conditions.filter(Boolean),
  })),
}));

import { markMessagesAsReadCore } from './mark-read';

function getUpdatePredicate(): Predicate {
  return mocks.updateWhere.mock.calls[0]?.[0] as Predicate;
}

function getBasePredicate(): Predicate {
  const updatePredicate = getUpdatePredicate();
  expect(updatePredicate).toMatchObject({ op: 'and' });
  return (updatePredicate as CompoundPredicate).conditions[0];
}

function evaluate(predicate: Predicate, row: Record<string, unknown>): boolean {
  switch (predicate.op) {
    case 'and':
      return predicate.conditions.every(condition => evaluate(condition, row));
    case 'or':
      return predicate.conditions.some(condition => evaluate(condition, row));
    case 'eq':
      return row[predicate.column] === predicate.value;
    case 'ne':
      return row[predicate.column] !== predicate.value;
    case 'inArray':
      return Array.isArray(predicate.values) && predicate.values.includes(row[predicate.column]);
    case 'isNull':
      return row[predicate.column] == null;
  }
}

const readableMessage = {
  'claimMessages.id': 'msg-1',
  'claimMessages.isInternal': false,
  'claimMessages.readAt': null,
  'claimMessages.senderId': 'staff-1',
  'claimMessages.tenantId': 'tenant-1',
};

describe('markMessagesAsReadCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.updateWhere });
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockImplementation(table => ({
      where: (predicate: Predicate) => {
        mocks.subqueryWhere(predicate);
        return { kind: 'subquery', table, predicate };
      },
    }));
  });

  it('rejects unauthenticated requests before updating', async () => {
    await expect(markMessagesAsReadCore({ session: null, messageIds: ['msg-1'] })).resolves.toEqual(
      { success: false, error: 'Unauthorized' }
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('applies recipient, tenant, unread, id, and public-visibility predicates for members', async () => {
    await markMessagesAsReadCore({
      session: {
        user: { id: 'member-1', role: 'user', tenantId: 'tenant-1' },
      } as never,
      messageIds: ['msg-1'],
    });

    const predicate = getBasePredicate();
    expect(evaluate(predicate, readableMessage)).toBe(true);
    expect(evaluate(predicate, { ...readableMessage, 'claimMessages.id': 'msg-2' })).toBe(false);
    expect(evaluate(predicate, { ...readableMessage, 'claimMessages.tenantId': 'tenant-2' })).toBe(
      false
    );
    expect(evaluate(predicate, { ...readableMessage, 'claimMessages.readAt': new Date() })).toBe(
      false
    );
    expect(evaluate(predicate, { ...readableMessage, 'claimMessages.senderId': 'member-1' })).toBe(
      false
    );
    expect(evaluate(predicate, { ...readableMessage, 'claimMessages.isInternal': true })).toBe(
      false
    );
    expect(evaluate(predicate, { ...readableMessage, 'claimMessages.isInternal': null })).toBe(
      false
    );

    const accessCondition = (getUpdatePredicate() as CompoundPredicate).conditions[1];
    expect(accessCondition).toMatchObject({
      op: 'inArray',
      column: 'claimMessages.claimId',
      values: {
        predicate: {
          op: 'and',
          conditions: expect.arrayContaining([
            { op: 'eq', column: 'claims.tenantId', value: 'tenant-1' },
            { op: 'eq', column: 'claims.userId', value: 'member-1' },
          ]),
        },
      },
    });
  });

  it('keeps agents on active linked-client claims and public messages', async () => {
    await markMessagesAsReadCore({
      session: {
        user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
      } as never,
      messageIds: ['msg-1'],
    });

    expect(evaluate(getBasePredicate(), readableMessage)).toBe(true);
    expect(
      evaluate(getBasePredicate(), { ...readableMessage, 'claimMessages.isInternal': true })
    ).toBe(false);
    expect(mocks.from).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ memberId: 'agentClients.memberId' })
    );
    expect(mocks.subqueryWhere).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        conditions: expect.arrayContaining([
          { op: 'eq', column: 'agentClients.tenantId', value: 'tenant-1' },
          { op: 'eq', column: 'agentClients.agentId', value: 'agent-1' },
          { op: 'eq', column: 'agentClients.status', value: 'active' },
        ]),
      })
    );
  });

  it.each([
    ['staff', 'staff-1', 'branch-1'],
    ['branch_manager', 'manager-1', 'branch-1'],
  ])('preserves internal-message access for scoped %s reads', async (role, id, branchId) => {
    await markMessagesAsReadCore({
      session: { user: { id, role, tenantId: 'tenant-1', branchId } } as never,
      messageIds: ['msg-1'],
    });

    expect(
      evaluate(getBasePredicate(), {
        ...readableMessage,
        'claimMessages.isInternal': true,
        'claimMessages.senderId': 'other-staff',
      })
    ).toBe(true);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it('preserves full-tenant internal-message access without a claim subquery', async () => {
    await markMessagesAsReadCore({
      session: {
        user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant-1' },
      } as never,
      messageIds: ['msg-1'],
    });

    expect(
      evaluate(getBasePredicate(), {
        ...readableMessage,
        'claimMessages.isInternal': true,
      })
    ).toBe(true);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
