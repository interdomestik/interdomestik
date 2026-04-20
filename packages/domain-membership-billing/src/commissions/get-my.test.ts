import { db } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMyCommissionsCore } from './get-my';

const commissionsQuery = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockResolvedValue([
    {
      id: 'comm-1',
      agentId: 'agent-1',
      memberId: 'member-1',
      subscriptionId: 'sub-1',
      type: 'renewal',
      status: 'pending',
      amount: '12.50',
      currency: 'EUR',
      earnedAt: new Date('2026-01-01T00:00:00.000Z'),
      paidAt: null,
      metadata: {},
    },
  ]),
};

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      user: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(() => commissionsQuery),
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentCommissions: {
    agentId: 'agentCommissions.agentId',
    amount: 'agentCommissions.amount',
    currency: 'agentCommissions.currency',
    earnedAt: 'agentCommissions.earnedAt',
    id: 'agentCommissions.id',
    memberId: 'agentCommissions.memberId',
    metadata: 'agentCommissions.metadata',
    paidAt: 'agentCommissions.paidAt',
    status: 'agentCommissions.status',
    subscriptionId: 'agentCommissions.subscriptionId',
    tenantId: 'agentCommissions.tenantId',
    type: 'agentCommissions.type',
  },
  user: {
    id: 'user.id',
    tenantId: 'user.tenantId',
  },
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...clauses) => ({ op: 'and', clauses })),
  desc: vi.fn(column => ({ op: 'desc', column })),
  eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
}));

describe('getMyCommissionsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commissionsQuery.from.mockReturnThis();
    commissionsQuery.where.mockReturnThis();
    commissionsQuery.orderBy.mockResolvedValue([
      {
        id: 'comm-1',
        agentId: 'agent-1',
        memberId: 'member-1',
        subscriptionId: 'sub-1',
        type: 'renewal',
        status: 'pending',
        amount: '12.50',
        currency: 'EUR',
        earnedAt: new Date('2026-01-01T00:00:00.000Z'),
        paidAt: null,
        metadata: {},
      },
    ]);
    (db.query.user.findFirst as any).mockResolvedValue({
      id: 'member-1',
      name: 'Member One',
      email: 'member@example.com',
      tenantId: 'tenant-1',
    });
  });

  it('scopes agent commission list reads and member enrichment to the session tenant', async () => {
    const result = await getMyCommissionsCore({
      session: {
        user: {
          id: 'agent-1',
          role: 'agent',
          name: 'Agent One',
          email: 'agent@example.com',
          tenantId: 'tenant-1',
        },
      } as any,
    });

    expect(result.success).toBe(true);
    expect(ensureTenantId).toHaveBeenCalled();
    expect(commissionsQuery.where).toHaveBeenCalledWith({
      op: 'and',
      clauses: [
        { op: 'eq', left: 'agentCommissions.agentId', right: 'agent-1' },
        { op: 'eq', left: 'agentCommissions.tenantId', right: 'tenant-1' },
      ],
    });
    expect(db.query.user.findFirst).toHaveBeenCalledWith({
      where: {
        op: 'and',
        clauses: [
          { op: 'eq', left: 'user.id', right: 'member-1' },
          { op: 'eq', left: 'user.tenantId', right: 'tenant-1' },
        ],
      },
    });
  });
});
