import { db, withTenantContext } from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMyCommissionsCore } from './get-my';

const hoisted = vi.hoisted(() => {
  const commissionRow = {
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
  };

  return {
    commissionRow,
    commissionsQuery: {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn(),
    },
  };
});

vi.mock('@interdomestik/database', () => {
  const db = {
    query: {
      user: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(() => hoisted.commissionsQuery),
  };
  return {
    db,
    withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) => cb(db)),
  };
});

vi.mock('@interdomestik/database/schema', () => ({
  agentCommissions: {
    agentId: 'agentCommissions.agentId',
    earnedAt: 'agentCommissions.earnedAt',
    tenantId: 'agentCommissions.tenantId',
  },
  user: {
    id: 'user.id',
    tenantId: 'user.tenantId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...clauses) => ({ op: 'and', clauses })),
  desc: vi.fn(column => ({ op: 'desc', column })),
  eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
}));

describe('getMyCommissionsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.commissionsQuery.from.mockReturnThis();
    hoisted.commissionsQuery.where.mockReturnThis();
    hoisted.commissionsQuery.orderBy.mockResolvedValue([hoisted.commissionRow]);
    (db.query.user.findFirst as any).mockResolvedValue({
      id: 'member-1',
      name: 'Member One',
      email: 'member@example.com',
      tenantId: 'tenant-1',
    });
  });

  it('scopes agent commission list reads and member enrichment to the session tenant', async () => {
    const authority = mintTestTenantAuthority('tenant-1');
    const result = await getMyCommissionsCore({
      authority,
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
    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(hoisted.commissionsQuery.where).toHaveBeenCalledWith({
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
