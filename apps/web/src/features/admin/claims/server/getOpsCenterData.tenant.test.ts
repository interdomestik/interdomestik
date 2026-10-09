import type { TenantTransaction } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  captureException: vi.fn(),
  globalDbReads: [] as string[],
}));

// Any access to the imported global handles is a defect: reads must use the callback tx.
vi.mock('@interdomestik/database', async () => {
  const schema = await vi.importActual<typeof import('@interdomestik/database/schema')>(
    '@interdomestik/database/schema'
  );
  const forbidden = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'symbol' || prop === 'then') return undefined;
        hoisted.globalDbReads.push(String(prop));
        throw new Error(`global database handle used: ${String(prop)}`);
      },
    }
  );
  return {
    claims: schema.claims,
    db: forbidden,
    dbRls: forbidden,
    withTenantContext: hoisted.withTenantContext,
  };
});

vi.mock('@sentry/nextjs', () => ({ captureException: hoisted.captureException }));

import {
  createRecordingTenantTransaction as createRecordingTx,
  type Compiled,
} from '@/test/recording-tenant-transaction';
import { mapClaimsToOperationalRows } from '../mappers';
import type { RawClaimRow } from '../mappers/mapClaimToOperationalRow';
import type { ClaimsVisibilityContext } from './claimVisibility';
import { computeKPIsFromPool } from './computeKPIs';
import { getOpsCenterData } from './getOpsCenterData';

const ZERO_STATS = {
  intake: 0,
  verification: 0,
  processing: 0,
  negotiation: 0,
  legal: 0,
  completed: 0,
};

/**
 * Runs every withTenantContext call on the given tx and tracks transaction lifetimes,
 * so tests can prove transactions never overlap (a max-1 pool would deadlock on nesting).
 */
function runInTx(tx: TenantTransaction) {
  const events: Array<'open' | 'close'> = [];
  let active = 0;
  let maxActive = 0;
  hoisted.withTenantContext.mockImplementation(
    async (_context: unknown, callback: (tx: TenantTransaction) => Promise<unknown>) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      events.push('open');
      try {
        return await callback(tx);
      } finally {
        active -= 1;
        events.push('close');
      }
    }
  );
  return { events, getMaxActive: () => maxActive };
}

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
  // Home tenant is consulted only as the NULL-access fallback.
  expect(sqlText.match(/"claim"\."tenant_id"/g)).toHaveLength(1);
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

function createPoolRow(id: string, claimNumber: string): RawClaimRow {
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
    const { tx, select, executed } = createRecordingTx([[], [STATS_ROW]]);
    runInTx(tx);

    await getOpsCenterData(createContext(), { search: 'mem-2026-000002' });

    // subquery + pool + stats are all built on a callback tx; only pool and stats are awaited.
    expect(select).toHaveBeenCalledTimes(3);
    expect(executed).toHaveLength(2);
    expect(flat(executed[0]?.sql ?? '')).toMatch(
      /"claim"\."userId" in \(select .+ from "user" where .*"member_number" ilike \$\d+\)/
    );
    expect(executed[0]?.params).toContain('MEM-2026-000002%');
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
