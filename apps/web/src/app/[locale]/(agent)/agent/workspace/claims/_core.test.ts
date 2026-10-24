import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withTenantContextMock: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContextMock,
}));

import { buildAgentWorkspaceClaimsWhere, getAgentWorkspaceClaimsCore } from './_core';

const dialect = new PgDialect();

function createTx() {
  return {
    query: {
      claims: { findMany: vi.fn() },
      agentClients: { findMany: vi.fn() },
      user: { findFirst: vi.fn() },
    },
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn(),
    selectDistinctOn: vi.fn().mockReturnThis(),
    orderBy: vi.fn(),
  };
}

type MockTx = ReturnType<typeof createTx>;

function runActionWith(tx: MockTx) {
  hoisted.withTenantContextMock.mockImplementation(
    async (_context: unknown, action: (tx: unknown) => Promise<unknown>) => action(tx)
  );
}

function claimRow(id: string, memberId: string, updatedAt = new Date()) {
  return {
    id,
    claimNumber: `CLM-${id}`,
    user: { id: memberId, name: null, email: `${memberId}@test.com` },
    branch: { name: 'B1' },
    title: `Claim ${id}`,
    caseLifecycleState: 'submitted',
    recoveryLifecycleState: 'not_started',
    createdAt: updatedAt,
    updatedAt,
    userId: memberId,
  };
}

const baseParams = { tenantId: 't1', userId: 'a1', role: 'agent' };

describe('getAgentWorkspaceClaimsCore', () => {
  beforeEach(() => {
    hoisted.withTenantContextMock.mockReset();
  });

  it('runs every dependent read on the tenant-context transaction with exact tenant and role', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.query.user.findFirst.mockResolvedValue({ branchId: 'branch-1' });
    tx.query.agentClients.findMany.mockResolvedValue([{ memberId: 'u1' }]);
    tx.query.claims.findMany.mockResolvedValue([claimRow('c1', 'u1')]);
    tx.groupBy.mockResolvedValueOnce([{ claimId: 'c1', count: 5 }]);
    tx.orderBy.mockResolvedValueOnce([{ claimId: 'c1', content: 'hello' }]);

    const result = await getAgentWorkspaceClaimsCore(baseParams);

    expect(hoisted.withTenantContextMock).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContextMock).toHaveBeenCalledWith(
      { tenantId: 't1', role: 'agent' },
      expect.any(Function)
    );
    expect(tx.query.user.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.query.agentClients.findMany).toHaveBeenCalledTimes(1);
    expect(tx.query.claims.findMany).toHaveBeenCalledTimes(1);
    expect(tx.groupBy).toHaveBeenCalledTimes(1);
    expect(tx.orderBy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      claims: [expect.objectContaining({ id: 'c1', unreadCount: 5, lastMessage: 'hello' })],
    });
  });

  it('applies the current branch exact-or-null predicate and public unread rules', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.query.user.findFirst.mockResolvedValue({ branchId: 'branch-1' });
    tx.query.agentClients.findMany.mockResolvedValue([{ memberId: 'u1' }]);
    tx.query.claims.findMany.mockResolvedValue([claimRow('c1', 'u1')]);
    tx.groupBy.mockResolvedValueOnce([]);
    tx.orderBy.mockResolvedValueOnce([]);

    await getAgentWorkspaceClaimsCore(baseParams);

    const claimsQuery = tx.query.claims.findMany.mock.calls[0][0] as { where: SQL; limit: number };
    const claimsWhere = dialect.sqlToQuery(claimsQuery.where);
    expect(claimsQuery.limit).toBe(100);
    expect(claimsWhere.params).toEqual(expect.arrayContaining(['t1', 'u1', 'branch-1']));
    expect(claimsWhere.sql.toLowerCase()).toContain('is null');

    const unreadWhere = dialect.sqlToQuery(tx.where.mock.calls[0][0] as SQL);
    expect(unreadWhere.params).toEqual(expect.arrayContaining(['t1', 'c1', false, 'a1']));
    expect(unreadWhere.sql.toLowerCase()).toContain('is null');
    expect(unreadWhere.sql).toContain('<>');

    const latestWhere = dialect.sqlToQuery(tx.where.mock.calls[1][0] as SQL);
    expect(latestWhere.params).toEqual(expect.arrayContaining(['t1', 'c1', false]));
  });

  it.each([['member'], ['staff'], ['unknown'], [''], [null], [undefined]])(
    'denies role %s before opening a transaction or reading dependent data',
    async role => {
      const tx = createTx();
      runActionWith(tx);

      const result = await getAgentWorkspaceClaimsCore({ ...baseParams, role });

      expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(hoisted.withTenantContextMock).not.toHaveBeenCalled();
      expect(tx.query.user.findFirst).not.toHaveBeenCalled();
      expect(tx.query.agentClients.findMany).not.toHaveBeenCalled();
      expect(tx.query.claims.findMany).not.toHaveBeenCalled();
    }
  );

  it.each([['admin'], ['tenant_admin'], ['super_admin']])(
    'admits supported admin-family role %s with the exercised role in context',
    async role => {
      const tx = createTx();
      runActionWith(tx);
      tx.query.user.findFirst.mockResolvedValue({ branchId: null });
      tx.query.agentClients.findMany.mockResolvedValue([]);

      const result = await getAgentWorkspaceClaimsCore({ ...baseParams, role });

      expect(result).toEqual({ ok: true, claims: [] });
      expect(hoisted.withTenantContextMock).toHaveBeenCalledWith(
        { tenantId: 't1', role },
        expect.any(Function)
      );
    }
  );

  it('injects selected claim when selectedClaimId is not in initial page', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.query.user.findFirst.mockResolvedValue({ branchId: 'branch-1' });
    tx.query.agentClients.findMany.mockResolvedValue([{ memberId: 'u1' }, { memberId: 'u2' }]);
    tx.query.claims.findMany
      .mockResolvedValueOnce([claimRow('visible-1', 'u1')])
      .mockResolvedValueOnce([claimRow('target-1', 'u2')]);
    tx.groupBy.mockResolvedValueOnce([
      { claimId: 'visible-1', count: 0 },
      { claimId: 'target-1', count: 2 },
    ]);
    tx.orderBy.mockResolvedValueOnce([
      { claimId: 'visible-1', content: 'hello' },
      { claimId: 'target-1', content: 'selected-message' },
    ]);

    const result = await getAgentWorkspaceClaimsCore({
      ...baseParams,
      selectedClaimId: 'target-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims).toHaveLength(2);
      expect(result.claims.find(c => c.id === 'target-1')).toMatchObject({
        unreadCount: 2,
        lastMessage: 'selected-message',
      });
    }
    expect(tx.query.claims.findMany).toHaveBeenCalledTimes(2);
  });

  it('keeps selected claim in the final capped list when selected claim is older', async () => {
    const tx = createTx();
    runActionWith(tx);
    const pageRows = Array.from({ length: 100 }, (_, index) =>
      claimRow(`visible-${index + 1}`, `u-${index + 1}`, new Date(2026, 0, 1, 0, index + 1))
    );
    tx.query.user.findFirst.mockResolvedValue({ branchId: 'branch-1' });
    tx.query.agentClients.findMany.mockResolvedValue([
      ...pageRows.map(row => ({ memberId: row.userId })),
      { memberId: 'u-target' },
    ]);
    tx.query.claims.findMany
      .mockResolvedValueOnce(pageRows)
      .mockResolvedValueOnce([claimRow('target-older', 'u-target', new Date(2025, 0, 1))]);
    tx.groupBy.mockResolvedValueOnce([]);
    tx.orderBy.mockResolvedValueOnce([]);

    const result = await getAgentWorkspaceClaimsCore({
      ...baseParams,
      selectedClaimId: 'target-older',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims).toHaveLength(100);
      expect(result.claims.map(c => c.id)).toContain('target-older');
    }
    expect(tx.query.claims.findMany).toHaveBeenCalledTimes(2);
  });

  it('does not inject selected claim when the member is outside the agent assignment scope', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.query.user.findFirst.mockResolvedValue({ branchId: 'branch-1' });
    tx.query.agentClients.findMany.mockResolvedValue([{ memberId: 'u1' }]);
    tx.query.claims.findMany
      .mockResolvedValueOnce([claimRow('visible-1', 'u1')])
      .mockResolvedValueOnce([]);
    tx.groupBy.mockResolvedValueOnce([{ claimId: 'visible-1', count: 0 }]);
    tx.orderBy.mockResolvedValueOnce([{ claimId: 'visible-1', content: 'hello' }]);

    const result = await getAgentWorkspaceClaimsCore({
      ...baseParams,
      selectedClaimId: 'target-2',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.map(c => c.id)).toEqual(['visible-1']);
    }
    expect(tx.query.claims.findMany).toHaveBeenCalledTimes(2);
  });

  it('returns legitimate empty claims when the agent has no active member assignments', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.query.user.findFirst.mockResolvedValue({ branchId: 'branch-1' });
    tx.query.agentClients.findMany.mockResolvedValue([]);

    const result = await getAgentWorkspaceClaimsCore(baseParams);

    expect(result).toEqual({ ok: true, claims: [] });
    expect(tx.query.claims.findMany).not.toHaveBeenCalled();
    expect(tx.select).not.toHaveBeenCalled();
  });

  it('keeps an existing agent row with null branch valid and unfiltered by branch', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.query.user.findFirst.mockResolvedValue({ branchId: null });
    tx.query.agentClients.findMany.mockResolvedValue([{ memberId: 'u1' }]);
    tx.query.claims.findMany.mockResolvedValue([claimRow('c1', 'u1')]);
    tx.groupBy.mockResolvedValueOnce([]);
    tx.orderBy.mockResolvedValueOnce([]);

    const result = await getAgentWorkspaceClaimsCore(baseParams);

    expect(result.ok).toBe(true);
    const claimsQuery = tx.query.claims.findMany.mock.calls[0][0] as { where: SQL };
    const claimsWhere = dialect.sqlToQuery(claimsQuery.where);
    expect(claimsWhere.params).toEqual(['t1', 'u1']);
    expect(claimsWhere.sql.toLowerCase()).not.toContain('is null');
  });

  it('propagates database failures instead of returning an empty success', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.query.user.findFirst.mockResolvedValue({ branchId: 'branch-1' });
    tx.query.agentClients.findMany.mockRejectedValue(new Error('permission denied'));

    await expect(getAgentWorkspaceClaimsCore(baseParams)).rejects.toThrow('permission denied');
  });

  it('propagates tenant context rejection of an empty tenant without reads', async () => {
    const tx = createTx();
    hoisted.withTenantContextMock.mockRejectedValue(
      new Error('withTenantContext requires a non-empty tenantId')
    );

    await expect(getAgentWorkspaceClaimsCore({ ...baseParams, tenantId: '' })).rejects.toThrow(
      'non-empty tenantId'
    );
    expect(tx.query.user.findFirst).not.toHaveBeenCalled();
  });
});

describe('buildAgentWorkspaceClaimsWhere', () => {
  it('omits the branch predicate when the agent has no current branch', () => {
    const query = dialect.sqlToQuery(
      buildAgentWorkspaceClaimsWhere({ tenantId: 't1', assignedMemberIds: ['u1'] })!
    );

    expect(query.params).toEqual(['t1', 'u1']);
    expect(query.sql.toLowerCase()).not.toContain('is null');
  });
});
