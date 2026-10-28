import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withTenantContextMock: vi.fn(),
}));

vi.mock('@interdomestik/database', async () => {
  const { claims } = await import('@interdomestik/database/schema');
  return { withTenantContext: hoisted.withTenantContextMock, claims };
});

import { buildAgentClaimsWhere, buildAgentWorkspaceClaimHref, getAgentClaimsCore } from './_core';

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const UPDATED_AT = new Date('2026-01-02T00:00:00.000Z');

function createTx() {
  const selectWhere = vi.fn();
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  return {
    select,
    query: {
      user: { findMany: vi.fn() },
      claims: { findMany: vi.fn() },
    },
    mocks: { selectWhere, selectFrom },
  };
}

type MockTx = ReturnType<typeof createTx>;

// Rows carry the real lifecycle pair, exactly as the production query selects them.
function claimRow(id: string, userId: string, title: string, status: ClaimStatus = 'submitted') {
  return {
    id,
    userId,
    title,
    ...claimLifecycleFieldsForStatus(status),
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function runActionWith(tx: MockTx) {
  hoisted.withTenantContextMock.mockImplementation(
    async (_context: unknown, action: (tx: unknown) => Promise<unknown>) => action(tx)
  );
}

const baseParams = {
  tenantId: 'tenant-1',
  userId: 'agent-1',
  role: 'agent',
};

describe('getAgentClaimsCore', () => {
  beforeEach(() => {
    hoisted.withTenantContextMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs every read inside one tenant context with the exact tenant and exercised role', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.mocks.selectWhere.mockResolvedValue([{ memberId: 'm1' }]);
    tx.query.user.findMany.mockResolvedValue([
      { id: 'm1', name: 'Member 1', email: 'm1@test.com' },
    ]);
    tx.query.claims.findMany.mockResolvedValue([claimRow('c1', 'm1', 'Claim 1')]);

    const result = await getAgentClaimsCore({ ...baseParams, branchId: 'branch-1' });

    expect(hoisted.withTenantContextMock).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContextMock).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', role: 'agent' },
      expect.any(Function)
    );
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(tx.query.user.findMany).toHaveBeenCalledTimes(1);
    expect(tx.query.claims.findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      data: [
        {
          memberId: 'm1',
          memberName: 'Member 1',
          memberEmail: 'm1@test.com',
          claims: [
            {
              id: 'c1',
              title: 'Claim 1',
              status: 'submitted',
              statusLabelKey: 'claims-tracking.status.submitted',
              createdAt: CREATED_AT.toISOString(),
              updatedAt: UPDATED_AT.toISOString(),
            },
          ],
        },
      ],
    });
  });

  it.each([['member'], ['staff'], ['unknown'], [''], [null], [undefined]])(
    'returns forbidden without opening a tenant transaction for role %s',
    async role => {
      const tx = createTx();
      runActionWith(tx);

      const result = await getAgentClaimsCore({ ...baseParams, role });

      expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(hoisted.withTenantContextMock).not.toHaveBeenCalled();
      expect(tx.select).not.toHaveBeenCalled();
      expect(tx.query.user.findMany).not.toHaveBeenCalled();
      expect(tx.query.claims.findMany).not.toHaveBeenCalled();
    }
  );

  it.each([['admin'], ['tenant_admin'], ['super_admin']])(
    'preserves supported admin-family role %s with the exercised role in context',
    async role => {
      const tx = createTx();
      runActionWith(tx);
      tx.mocks.selectWhere.mockResolvedValue([]);

      const result = await getAgentClaimsCore({ ...baseParams, role });

      expect(result).toEqual({ ok: true, data: [] });
      expect(hoisted.withTenantContextMock).toHaveBeenCalledWith(
        { tenantId: 'tenant-1', role },
        expect.any(Function)
      );
    }
  );

  it('returns legitimate empty data when no active relationship exists', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.mocks.selectWhere.mockResolvedValue([]);

    const result = await getAgentClaimsCore(baseParams);

    expect(result).toEqual({ ok: true, data: [] });
    expect(tx.query.user.findMany).not.toHaveBeenCalled();
    expect(tx.query.claims.findMany).not.toHaveBeenCalled();
  });

  it('returns empty data when active relationships resolve to no tenant members', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.mocks.selectWhere.mockResolvedValue([{ memberId: 'm1' }]);
    tx.query.user.findMany.mockResolvedValue([]);

    const result = await getAgentClaimsCore(baseParams);

    expect(result).toEqual({ ok: true, data: [] });
    expect(tx.query.claims.findMany).not.toHaveBeenCalled();
  });

  it('groups claims by member correctly', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.mocks.selectWhere.mockResolvedValue([{ memberId: 'm1' }, { memberId: 'm2' }]);
    tx.query.user.findMany.mockResolvedValue([
      { id: 'm1', name: 'Member 1', email: 'm1@test.com' },
      { id: 'm2', name: 'Member 2', email: 'm2@test.com' },
    ]);
    tx.query.claims.findMany.mockResolvedValue([
      claimRow('c1', 'm1', 'Claim 1', 'submitted'),
      claimRow('c2', 'm1', 'Claim 2', 'evaluation'),
    ]);

    const result = await getAgentClaimsCore(baseParams);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.length).toBe(1);
      expect(result.data[0].memberId).toBe('m1');
      expect(result.data[0].claims.map(claim => [claim.id, claim.status])).toEqual([
        ['c1', 'submitted'],
        ['c2', 'evaluation'],
      ]);
    }
  });

  it('deduplicates repeated member ids from active agent_clients rows', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.mocks.selectWhere.mockResolvedValue([{ memberId: 'm4' }, { memberId: 'm4' }]);
    tx.query.user.findMany.mockResolvedValue([
      { id: 'm4', name: 'Member 4', email: 'm4@test.com' },
    ]);
    tx.query.claims.findMany.mockResolvedValue([claimRow('c4', 'm4', 'Claim 4')]);

    const result = await getAgentClaimsCore(baseParams);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.length).toBe(1);
      expect(result.data[0].claims).toEqual([
        expect.objectContaining({ id: 'c4', status: 'submitted' }),
      ]);
    }
    expect(tx.query.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not include members from stale user.agentId linkage when no active agent_clients row exists', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.mocks.selectWhere.mockResolvedValue([]);
    tx.query.claims.findMany.mockResolvedValue([claimRow('c-stale', 'm-stale', 'Stale')]);

    const result = await getAgentClaimsCore(baseParams);

    expect(result).toEqual({ ok: true, data: [] });
    expect(tx.query.claims.findMany).not.toHaveBeenCalled();
  });

  it('returns INTERNAL (not empty success) when a transaction read fails', async () => {
    const tx = createTx();
    runActionWith(tx);
    tx.mocks.selectWhere.mockRejectedValue(new Error('permission denied'));

    const result = await getAgentClaimsCore(baseParams);

    expect(result).toEqual({ ok: false, code: 'INTERNAL' });
  });

  it('returns INTERNAL without reads when tenant context rejects an empty tenant', async () => {
    const tx = createTx();
    hoisted.withTenantContextMock.mockRejectedValue(
      new Error('withTenantContext requires a non-empty tenantId')
    );

    const result = await getAgentClaimsCore({ ...baseParams, tenantId: '' });

    expect(result).toEqual({ ok: false, code: 'INTERNAL' });
    expect(hoisted.withTenantContextMock).toHaveBeenCalledWith(
      { tenantId: '', role: 'agent' },
      expect.any(Function)
    );
    expect(tx.select).not.toHaveBeenCalled();
  });
});

describe('buildAgentClaimsWhere', () => {
  const dialect = new PgDialect();

  it('adds the exact branch predicate only when a branch is present', () => {
    const withBranch = dialect.sqlToQuery(
      buildAgentClaimsWhere({ tenantId: 'tenant-1', memberIds: ['m1'], branchId: 'branch-1' })!
    );
    const withoutBranch = dialect.sqlToQuery(
      buildAgentClaimsWhere({ tenantId: 'tenant-1', memberIds: ['m1'] })!
    );

    expect(withBranch.params).toEqual(expect.arrayContaining(['tenant-1', 'm1', 'branch-1']));
    expect(withBranch.sql.toLowerCase()).not.toContain('is null');
    expect(withoutBranch.params).not.toContain('branch-1');
  });
});

describe('buildAgentWorkspaceClaimHref', () => {
  it('builds workspace claim deep-link with claimId query param', () => {
    expect(buildAgentWorkspaceClaimHref('claim-123')).toBe(
      '/agent/workspace/claims?claimId=claim-123'
    );
  });
});
