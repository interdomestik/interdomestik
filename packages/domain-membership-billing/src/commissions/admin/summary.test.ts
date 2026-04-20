import { ensureTenantId } from '@interdomestik/shared-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getGlobalCommissionSummaryCore } from './summary';

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
    amount: 'agentCommissions.amount',
    status: 'agentCommissions.status',
    tenantId: 'agentCommissions.tenantId',
  },
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
  sql: vi.fn(() => 'sql'),
}));

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
      } as any,
    });

    expect(ensureTenantId).toHaveBeenCalled();
    expect(hoisted.queryChain.where).toHaveBeenCalledWith({
      op: 'eq',
      left: 'agentCommissions.tenantId',
      right: 'tenant-1',
    });
  });
});
