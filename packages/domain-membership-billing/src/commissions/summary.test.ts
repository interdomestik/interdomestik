import { ensureTenantId } from '@interdomestik/shared-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getGlobalCommissionSummaryCore } from './admin/summary';
import { getMyCommissionSummaryCore } from './summary';

const hoisted = vi.hoisted(() => ({
  queryChain: {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    select: vi.fn(() => hoisted.queryChain),
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentCommissions: {
    agentId: 'agentCommissions.agentId',
    amount: 'agentCommissions.amount',
    status: 'agentCommissions.status',
    tenantId: 'agentCommissions.tenantId',
  },
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...clauses) => ({ op: 'and', clauses })),
  eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
  sql: vi.fn(() => 'sql'),
}));

describe('getMyCommissionSummaryCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.queryChain.from.mockReturnThis();
    hoisted.queryChain.where.mockReturnThis();
    hoisted.queryChain.groupBy.mockResolvedValue([]);
  });

  it('scopes agent commission summaries to the session tenant and agent', async () => {
    await getMyCommissionSummaryCore({
      session: {
        user: { id: 'agent-1', role: 'agent', email: 'agent@example.com', tenantId: 'tenant-1' },
      } as any,
    });

    expect(ensureTenantId).toHaveBeenCalled();
    expect(hoisted.queryChain.where).toHaveBeenCalledWith({
      op: 'and',
      clauses: [
        { op: 'eq', left: 'agentCommissions.agentId', right: 'agent-1' },
        { op: 'eq', left: 'agentCommissions.tenantId', right: 'tenant-1' },
      ],
    });
  });
});

describe('getGlobalCommissionSummaryCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.queryChain.from.mockReturnThis();
    hoisted.queryChain.where.mockReturnThis();
    hoisted.queryChain.groupBy.mockResolvedValue([]);
  });

  it('scopes admin commission summaries to the session tenant', async () => {
    await getGlobalCommissionSummaryCore({
      session: {
        user: { id: 'admin-1', role: 'admin', email: 'admin@example.com', tenantId: 'tenant-1' },
      },
    });

    expect(ensureTenantId).toHaveBeenCalled();
    expect(hoisted.queryChain.where).toHaveBeenCalledWith({
      op: 'eq',
      left: 'agentCommissions.tenantId',
      right: 'tenant-1',
    });
  });
});
