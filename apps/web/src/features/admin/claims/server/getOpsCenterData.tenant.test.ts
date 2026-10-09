import { beforeEach, describe, expect, it } from 'vitest';

import { hoisted, runInTx } from './ops-pool.test-fixtures';

import {
  createRecordingTenantTransaction as createRecordingTx,
  type Compiled,
} from '@/test/recording-tenant-transaction';
import { mapClaimsToOperationalRows } from '../mappers';
import type { ClaimsVisibilityContext } from './claimVisibility';
import { computeKPIsFromPool } from './computeKPIs';
import { getOpsCenterData } from './getOpsCenterData';
import type { OpsCenterPoolRow } from './readOpsCenterPool';

const ZERO_STATS = {
  intake: 0,
  verification: 0,
  processing: 0,
  negotiation: 0,
  legal: 0,
  completed: 0,
};

const flat = (value: string) => value.replace(/\s+/g, ' ');

function expectAccessTenantPredicate(query: Compiled | undefined, tenantId: string) {
  expect(query).toBeDefined();
  const sqlText = flat(query?.sql ?? '');
  const match =
    /"claim"\."access_tenant_id" = \$(\d+) OR \("claim"\."access_tenant_id" IS NULL AND "claim"\."tenant_id" = \$(\d+)\)/.exec(
      sqlText
    );
  expect(match).not.toBeNull();
  expect(query?.params[Number(match?.[1]) - 1]).toBe(tenantId);
  expect(query?.params[Number(match?.[2]) - 1]).toBe(tenantId);
  // Home tenant is consulted only as the NULL-access fallback in the predicate
  // (the pool also projects the home tenant internally for the home-reference fallback).
  const whereText = sqlText.slice(sqlText.indexOf(' where '));
  expect(whereText.match(/"claim"\."tenant_id"/g)).toHaveLength(1);
}

function createContext(overrides: Partial<ClaimsVisibilityContext> = {}): ClaimsVisibilityContext {
  return { tenantId: 'tenant-mk', userId: 'admin-1', role: 'admin', branchId: null, ...overrides };
}

const STATS_ROW = {
  intake: '2',
  verification: 0,
  processing: 0,
  negotiation: 0,
  legal: 0,
  completed: '1',
};

function createPoolRow(id: string, claimNumber: string): OpsCenterPoolRow {
  const now = new Date();
  return {
    claim: {
      id,
      title: `Claim ${claimNumber}`,
      status: 'submitted',
      caseLifecycleState: null,
      recoveryLifecycleState: null,
      createdAt: now,
      updatedAt: now,
      assignedAt: null,
      userId: 'member-1',
      claimNumber,
      staffId: null,
      category: 'vehicle',
      currency: 'EUR',
      statusUpdatedAt: now,
      origin: 'portal',
      originRefId: null,
      diasporaCountry: null,
    },
    claimant: {
      name: 'Member One',
      email: 'member1@example.test',
      memberNumber: 'MEM-2026-000001',
    },
    staff: null,
    branch: { id: null, code: null, name: null },
    agent: null,
    home: { tenantId: 'tenant-mk', branchId: null, agentId: null },
  };
}

describe('getOpsCenterData tenant transaction', () => {
  beforeEach(() => {
    hoisted.withTenantContext.mockReset();
    hoisted.captureException.mockReset();
    hoisted.globalDbReads.length = 0;
  });

  it.each([
    { role: 'staff', branchId: 'branch-1' },
    { role: null, branchId: null },
    { role: 'agent', branchId: null },
    { role: 'member', branchId: null },
    { role: 'branch_manager', branchId: null },
  ])('denies %o before any transaction or query', async overrides => {
    const result = await getOpsCenterData(createContext(overrides));

    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.captureException).not.toHaveBeenCalled();
    expect(result.prioritized).toEqual([]);
    expect(result.stats).toStrictEqual(ZERO_STATS);
    expect(result.kpis.totalOpen).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it('reads pool then stats in two sequential non-overlapping transactions with the actor context', async () => {
    const { tx, executed } = createRecordingTx([[], [STATS_ROW]]);
    const tracker = runInTx(tx);

    const result = await getOpsCenterData(createContext());

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(2);
    for (const call of hoisted.withTenantContext.mock.calls) {
      expect(call[0]).toStrictEqual({ tenantId: 'tenant-mk', role: 'admin' });
    }
    // Pool transaction is fully released before the stats transaction opens.
    expect(tracker.events).toEqual(['open', 'close', 'open', 'close']);
    expect(tracker.getMaxActive()).toBe(1);
    expect(executed).toHaveLength(2);
    expectAccessTenantPredicate(executed[0], 'tenant-mk');
    expect(executed[0]?.params.at(-1)).toBe(201);
    expect(flat(executed[1]?.sql ?? '')).toMatch(/^select count\(CASE WHEN /);
    expectAccessTenantPredicate(executed[1], 'tenant-mk');
    expect(result.stats).toStrictEqual({ ...ZERO_STATS, intake: 2, completed: 1 });
    expect(result.prioritized).toEqual([]);
    expect(hoisted.captureException).not.toHaveBeenCalled();
    expect(hoisted.globalDbReads).toEqual([]);
  });

  it('keeps the branch manager own-branch predicate in pool and stats', async () => {
    const { tx, executed } = createRecordingTx([[], [STATS_ROW]]);
    const tracker = runInTx(tx);

    await getOpsCenterData(
      createContext({ role: 'branch_manager', branchId: 'branch-1', userId: 'bm-1' })
    );

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(2);
    for (const call of hoisted.withTenantContext.mock.calls) {
      expect(call[0]).toStrictEqual({ tenantId: 'tenant-mk', role: 'branch_manager' });
    }
    expect(tracker.getMaxActive()).toBe(1);
    expect(executed).toHaveLength(2);
    for (const query of executed) {
      expectAccessTenantPredicate(query, 'tenant-mk');
      expect(flat(query.sql)).toContain('"claim"."branch_id" = $');
      expect(query.params).toContain('branch-1');
    }
  });

  it('builds the member-number subquery from the pool transaction', async () => {
    const { tx, select, executed } = createRecordingTx([[], [], [STATS_ROW]]);
    const tracker = runInTx(tx);

    await getOpsCenterData(createContext(), { search: 'mem-2026-000002' });

    // transferred scan + subquery + pool + stats are all built on a callback tx; with no
    // transferred candidate the pool runs in the scan's access transaction (scan, pool, stats awaited).
    expect(select).toHaveBeenCalledTimes(4);
    expect(executed).toHaveLength(3);
    expect(tracker.events).toEqual(['open', 'close', 'open', 'close']);
    expect(flat(executed[1]?.sql ?? '')).toMatch(
      /"claim"\."userId" in \(select .+ from "user" where .*"member_number" ilike \$\d+\)/
    );
    expect(executed[1]?.params).toContain('MEM-2026-000002%');
    expect(hoisted.globalDbReads).toEqual([]);
  });

  it('keeps a valid pool and KPIs with zero stats when only the stats read fails', async () => {
    const statsFailure = new Error('stats aggregate timed out');
    const poolRow = createPoolRow('claim-ops-1', 'CLM-OPS-0001');
    const { tx, executed } = createRecordingTx([[poolRow], statsFailure]);
    const tracker = runInTx(tx);

    const result = await getOpsCenterData(createContext());

    const expectedPool = mapClaimsToOperationalRows([poolRow]);
    expect(result.prioritized.map(row => row.id)).toEqual(['claim-ops-1']);
    expect(result.prioritized[0]?.code).toBe('CLM-OPS-0001');
    expect(result.kpis).toStrictEqual(computeKPIsFromPool(expectedPool, 'admin-1'));
    expect(result.kpis.totalOpen).toBeGreaterThan(0);
    expect(result.stats).toStrictEqual(ZERO_STATS);
    expect(result.hasMore).toBe(false);

    // Only the stats failure is reported, by the stats wrapper, not the loader.
    expect(hoisted.captureException).toHaveBeenCalledTimes(1);
    expect(hoisted.captureException).toHaveBeenCalledWith(statsFailure, {
      extra: { tenantId: 'tenant-mk', action: 'getAdminClaimStats' },
    });

    // Two sequential transactions, each with the actual actor context, never overlapping.
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(2);
    for (const call of hoisted.withTenantContext.mock.calls) {
      expect(call[0]).toStrictEqual({ tenantId: 'tenant-mk', role: 'admin' });
    }
    expect(tracker.events).toEqual(['open', 'close', 'open', 'close']);
    expect(tracker.getMaxActive()).toBe(1);
    expect(executed).toHaveLength(2);
    expectAccessTenantPredicate(executed[0], 'tenant-mk');
    expectAccessTenantPredicate(executed[1], 'tenant-mk');
    expect(hoisted.globalDbReads).toEqual([]);
  });

  it('reports and returns the fallback when the pool read fails, without a stats transaction', async () => {
    const failure = new Error('permission denied for table claim');
    const { tx, executed } = createRecordingTx([failure]);
    const tracker = runInTx(tx);
    const filters = { lifecycle: 'intake' as const };

    const result = await getOpsCenterData(createContext(), filters);

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(tracker.events).toEqual(['open', 'close']);
    expect(executed).toHaveLength(1);
    expect(hoisted.captureException).toHaveBeenCalledTimes(1);
    expect(hoisted.captureException).toHaveBeenCalledWith(failure, {
      extra: { tenantId: 'tenant-mk', action: 'getOpsCenterData', filters },
    });
    expect(result.stats).toStrictEqual(ZERO_STATS);
    expect(result.prioritized).toEqual([]);
  });

  it('returns the fallback when the tenant transaction cannot be opened', async () => {
    const failure = new Error('connection refused');
    hoisted.withTenantContext.mockRejectedValue(failure);

    const result = await getOpsCenterData(createContext());

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.captureException).toHaveBeenCalledTimes(1);
    expect(result.hasMore).toBe(false);
    expect(result.stats).toStrictEqual(ZERO_STATS);
  });
});
