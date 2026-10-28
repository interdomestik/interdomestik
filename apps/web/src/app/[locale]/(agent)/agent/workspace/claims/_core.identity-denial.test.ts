import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock('@interdomestik/database', () => ({ withTenantContext: mocks.context }));

import { getAgentWorkspaceClaimsCore } from './_core';

it.each(['agent', 'admin', 'tenant_admin', 'super_admin'])(
  'denies %s when identity is absent from the access tenant before any downstream reads',
  async role => {
    mocks.context.mockReset();
    const tx = {
      query: {
        user: { findFirst: vi.fn().mockResolvedValue(undefined) },
        agentClients: { findMany: vi.fn().mockResolvedValue([{ memberId: 'u1' }]) },
        claims: { findMany: vi.fn().mockResolvedValue([{ id: 'c1', userId: 'u1' }]) },
      },
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue([{ claimId: 'c1', count: 1 }]),
      selectDistinctOn: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([{ claimId: 'c1', content: 'hello' }]),
    };
    mocks.context.mockImplementation((_context, read) => read(tx));

    const result = await getAgentWorkspaceClaimsCore({
      tenantId: 'tenant-access',
      userId: 'home-agent',
      role,
      selectedClaimId: 'c1',
    });

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(mocks.context).toHaveBeenCalledWith(
      { tenantId: 'tenant-access', role },
      expect.any(Function)
    );
    expect(tx.query.user.findFirst).toHaveBeenCalledTimes(1);
    const lookup = tx.query.user.findFirst.mock.calls[0][0] as { where: SQL };
    expect(new PgDialect().sqlToQuery(lookup.where).params).toEqual([
      'home-agent',
      'tenant-access',
    ]);
    expect(tx.query.agentClients.findMany).not.toHaveBeenCalled();
    expect(tx.query.claims.findMany).not.toHaveBeenCalled();
    expect(tx.select).not.toHaveBeenCalled();
    expect(tx.selectDistinctOn).not.toHaveBeenCalled();
    expect(tx.groupBy).not.toHaveBeenCalled();
    expect(tx.orderBy).not.toHaveBeenCalled();
  }
);
