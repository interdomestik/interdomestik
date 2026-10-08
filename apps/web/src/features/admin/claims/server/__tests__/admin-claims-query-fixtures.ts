import { afterEach, beforeEach, expect, vi } from 'vitest';

import type { AdminClaimsV2Response } from '../../types';

const hoisted = vi.hoisted(() => {
  const mainQuery = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn(),
  };

  const countQuery = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };

  const historyQuery = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn(),
  };

  // The callback transaction. Every read must go through this select spy.
  const txSelect = vi.fn();
  const tx = { select: txSelect };

  return {
    // Reads that escape the withTenantContext callback land here and must fail the test.
    dbSelect: vi.fn(() => {
      throw new Error('read escaped the withTenantContext callback: db.select');
    }),
    withTenantContext: vi.fn(),
    captureException: vi.fn(),
    mapClaimsToOperationalRows: vi.fn(),
    readAdminClaimStats: vi.fn(),
    buildDiasporaOriginClaimIdsSubquery: vi.fn(),
    // Untracked return slot so a thenable builder result never passes through a spy's result tracking.
    diasporaBuilderResult: { current: undefined as unknown },
    claimLifecycleStatusIn: vi.fn((statuses: unknown[]) => ({ type: 'lifecycle-in', statuses })),
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((a: unknown, b: unknown) => `eq:${String(a)}:${String(b)}`),
    desc: vi.fn((field: unknown) => `desc:${String(field)}`),
    or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
    ilike: vi.fn((field: unknown, pattern: unknown) => `ilike:${String(field)}:${String(pattern)}`),
    inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
    count: vi.fn(() => 'count(*)'),
    sql: vi.fn((strings: TemplateStringsArray) => ({ type: 'sql', text: strings.join('') })),
    aliasedTable: vi.fn((_table: unknown, alias: string) => ({ __alias: alias })),
    mainQuery,
    countQuery,
    historyQuery,
    tx,
    txSelect,
  };
});

vi.mock('@interdomestik/database', () => ({
  db: {
    select: hoisted.dbSelect,
  },
  withTenantContext: hoisted.withTenantContext,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureException,
}));

vi.mock('@interdomestik/database/schema', () => ({
  claims: {
    id: 'claims.id',
    tenantId: 'claims.tenantId',
    userId: 'claims.userId',
    staffId: 'claims.staffId',
    branchId: 'claims.branchId',
    title: 'claims.title',
    caseLifecycleState: 'claims.caseLifecycleState',
    recoveryLifecycleState: 'claims.recoveryLifecycleState',
    createdAt: 'claims.createdAt',
    updatedAt: 'claims.updatedAt',
    assignedAt: 'claims.assignedAt',
    category: 'claims.category',
    currency: 'claims.currency',
    claimNumber: 'claims.claimNumber',
    origin: 'claims.origin',
    originRefId: 'claims.originRefId',
    statusUpdatedAt: 'claims.statusUpdatedAt',
  },
  claimStageHistory: {
    claimId: 'claimStageHistory.claimId',
    tenantId: 'claimStageHistory.tenantId',
    note: 'claimStageHistory.note',
    createdAt: 'claimStageHistory.createdAt',
    id: 'claimStageHistory.id',
  },
  user: {
    id: 'user.id',
    name: 'user.name',
    email: 'user.email',
  },
  branches: {
    id: 'branches.id',
    code: 'branches.code',
    name: 'branches.name',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
  desc: hoisted.desc,
  or: hoisted.or,
  ilike: hoisted.ilike,
  inArray: hoisted.inArray,
  count: hoisted.count,
  sql: hoisted.sql,
  aliasedTable: hoisted.aliasedTable,
}));

vi.mock('../../mappers', () => ({
  mapClaimsToOperationalRows: hoisted.mapClaimsToOperationalRows,
}));

vi.mock('@interdomestik/domain-claims', () => ({
  parseDiasporaOriginFromPublicNote: (note: string | null | undefined) =>
    note?.includes('Started from Diaspora / Green Card quickstart.')
      ? { source: 'diaspora-green-card', country: note.includes('Country: DE') ? 'DE' : null }
      : null,
  buildDiasporaOriginClaimIdsSubquery: (tenantId: string) => {
    const result = hoisted.buildDiasporaOriginClaimIdsSubquery(tenantId);
    return hoisted.diasporaBuilderResult.current ?? result;
  },
}));

vi.mock('@interdomestik/domain-claims/claims/lifecycle-read-sql', () => ({
  claimLifecycleStatusIn: hoisted.claimLifecycleStatusIn,
  claimLifecycleStatusSql: vi.fn(() => 'claims.lifecycleStatus'),
}));

vi.mock('../getAdminClaimStats', () => ({
  readAdminClaimStats: hoisted.readAdminClaimStats,
}));

const DIASPORA_NOTE_DE =
  'Started from Diaspora / Green Card quickstart. Country: DE. Incident location: abroad.';

const ZERO_STATS = {
  intake: 0,
  verification: 0,
  processing: 0,
  negotiation: 0,
  legal: 0,
  completed: 0,
};

type OkResponse = Extract<AdminClaimsV2Response, { kind: 'ok' }>;
type ReadStage = 'rows' | 'history' | 'stats' | 'count';

const ADMIN_CONTEXT = { tenantId: 'tenant-A', userId: 'u1', role: 'admin', branchId: null };

/**
 * Wires fresh results for the rows -> history -> stats -> count reads.
 * The transaction select queue mirrors the reads the loader must issue: history is skipped when
 * the page has no rows, so an unexpected extra read fails instead of silently returning data.
 */
function mockQueryResults(
  rawRows: unknown[],
  totalCount: unknown,
  options: { history?: unknown[]; failAt?: ReadStage; failure?: Error } = {}
) {
  const failure = options.failure ?? new Error(`${options.failAt ?? 'read'} failed`);

  hoisted.mainQuery.offset.mockResolvedValue(rawRows);
  hoisted.historyQuery.orderBy.mockResolvedValue(options.history ?? []);
  hoisted.countQuery.where.mockResolvedValue([{ totalCount }]);

  if (options.failAt === 'rows') hoisted.mainQuery.offset.mockRejectedValue(failure);
  if (options.failAt === 'history') hoisted.historyQuery.orderBy.mockRejectedValue(failure);
  if (options.failAt === 'stats') hoisted.readAdminClaimStats.mockRejectedValue(failure);
  if (options.failAt === 'count') hoisted.countQuery.where.mockRejectedValue(failure);

  hoisted.txSelect.mockReset();
  hoisted.txSelect.mockImplementation(() => {
    throw new Error('unexpected extra tx.select read');
  });
  const queue =
    rawRows.length > 0
      ? [hoisted.mainQuery, hoisted.historyQuery, hoisted.countQuery]
      : [hoisted.mainQuery, hoisted.countQuery];
  for (const query of queue) {
    hoisted.txSelect.mockImplementationOnce(() => query);
  }

  return failure;
}

function expectOk(result: AdminClaimsV2Response): OkResponse {
  expect(result.kind).toBe('ok');
  if (result.kind !== 'ok') {
    throw new Error('expected an ok admin claims response');
  }
  return result;
}

function expectReadFailed(result: AdminClaimsV2Response) {
  // Strict equality also rejects fabricated rows/stats/pagination keys, even undefined ones.
  expect(result).toStrictEqual({ kind: 'error', error: 'read_failed' });
}

function mainConditionArgs(): unknown[] {
  return hoisted.and.mock.calls[0] ?? [];
}

function createAdminRawRow(args: {
  id: string;
  claimNumber: string;
  userId: string;
  title: string;
  claimantName: string;
  claimantEmail: string;
}) {
  return {
    claim: {
      id: args.id,
      claimNumber: args.claimNumber,
      userId: args.userId,
      title: args.title,
      status: 'submitted',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      assignedAt: null,
      category: null,
      currency: null,
      origin: 'portal',
      originRefId: null,
      statusUpdatedAt: null,
    },
    claimant: { name: args.claimantName, email: args.claimantEmail },
    staff: { name: null, email: null },
    branch: { id: 'branch-1', code: 'KS', name: 'Kosovo' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.mapClaimsToOperationalRows.mockReturnValue([]);
  hoisted.readAdminClaimStats.mockResolvedValue({ ...ZERO_STATS });
  hoisted.buildDiasporaOriginClaimIdsSubquery.mockReturnValue('diaspora-subquery');
  hoisted.diasporaBuilderResult.current = undefined;
  hoisted.withTenantContext.mockImplementation(
    async (_context: unknown, callback: (tx: unknown) => Promise<unknown>) => callback(hoisted.tx)
  );
});

afterEach(() => {
  expect(hoisted.dbSelect).not.toHaveBeenCalled();
});

export {
  hoisted,
  DIASPORA_NOTE_DE,
  ZERO_STATS,
  ADMIN_CONTEXT,
  mockQueryResults,
  expectOk,
  expectReadFailed,
  mainConditionArgs,
  createAdminRawRow,
};
