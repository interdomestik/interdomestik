import { user } from '@interdomestik/database/schema';
import { and, eq, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    query: {
      user: { findFirst: vi.fn() },
      subscriptions: { findFirst: vi.fn() },
      userNotificationPreferences: { findFirst: vi.fn() },
    },
  };
  return {
    tx,
    withTenantContext: vi.fn((_context: unknown, action: (client: typeof tx) => Promise<unknown>) =>
      action(tx)
    ),
    getAdminUserClaimSummary: vi.fn(),
  };
});

vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  withTenantContext: mocks.withTenantContext,
}));
vi.mock('./_claim-summary', () => ({ getAdminUserClaimSummary: mocks.getAdminUserClaimSummary }));

import { getAdminUserProfileCore } from './_core';

const dialect = new PgDialect();
const MEMBER = { id: 'u1', tenantId: 't1', branchId: 'b-A', memberNumber: null, agent: null };
const COUNTS = { total: 0, open: 0, resolved: 0, rejected: 0 };

function load(role: string | null, branchId: string | null, tenantId: string | null = 't1') {
  return getAdminUserProfileCore({
    userId: 'u1',
    tenantId,
    actor: { role, branchId },
    recentClaimsLimit: 6,
  });
}

function memberLookup(): { params: unknown[]; sql: string; with: unknown } {
  const [{ where, with: relations }] = mocks.tx.query.user.findFirst.mock.calls[0] as [
    { where: SQL; with: unknown },
  ];
  return { ...dialect.sqlToQuery(where), with: relations };
}

function expectNoDependentReads(): void {
  expect(mocks.tx.query.subscriptions.findFirst).not.toHaveBeenCalled();
  expect(mocks.tx.query.userNotificationPreferences.findFirst).not.toHaveBeenCalled();
  expect(mocks.getAdminUserClaimSummary).not.toHaveBeenCalled();
}

function expectNoTransaction(): void {
  expect(mocks.withTenantContext).not.toHaveBeenCalled();
  expect(mocks.tx.query.user.findFirst).not.toHaveBeenCalled();
  expectNoDependentReads();
}

describe('getAdminUserProfileCore member-read access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.query.user.findFirst.mockResolvedValue(MEMBER);
    mocks.tx.query.subscriptions.findFirst.mockResolvedValue(undefined);
    mocks.tx.query.userNotificationPreferences.findFirst.mockResolvedValue(undefined);
    mocks.getAdminUserClaimSummary.mockResolvedValue({ counts: COUNTS, recentClaims: [] });
  });

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'reads any tenant member for %s with the actual role in tenant context',
    async role => {
      expect(await load(role, 'b-other')).toEqual({
        kind: 'ok',
        member: MEMBER,
        subscription: null,
        preferences: null,
        counts: COUNTS,
        recentClaims: [],
        membershipStatus: 'none',
      });
      expect(mocks.withTenantContext).toHaveBeenCalledWith(
        { tenantId: 't1', role },
        expect.any(Function)
      );
      const lookup = memberLookup();
      expect(lookup).toMatchObject(
        dialect.sqlToQuery(and(eq(user.id, 'u1'), eq(user.tenantId, 't1'))!)
      );
      expect(lookup.with).toEqual({ agent: true });
      // The granted full-tenant scope drops the actor's own branch from the claim summary.
      expect(mocks.getAdminUserClaimSummary).toHaveBeenCalledWith({
        db: mocks.tx,
        recentClaimsLimit: 6,
        scope: { role, branchId: null },
        tenantId: 't1',
        userId: 'u1',
      });
    }
  );

  it('keeps the caller-resolved selected tenant for a super admin', async () => {
    await load('super_admin', null, 't-selected');
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 't-selected', role: 'super_admin' },
      expect.any(Function)
    );
    expect(memberLookup().params).toEqual(['u1', 't-selected']);
    expect(mocks.getAdminUserClaimSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { role: 'super_admin', branchId: null },
        tenantId: 't-selected',
        userId: 'u1',
      })
    );
  });

  it('reads an own-branch member for a branch manager and only then loads dependents', async () => {
    const result = await load('branch_manager', 'b-A');
    expect(result.kind).toBe('ok');
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 't1', role: 'branch_manager' },
      expect.any(Function)
    );
    expect(memberLookup()).toMatchObject(
      dialect.sqlToQuery(and(eq(user.id, 'u1'), eq(user.tenantId, 't1'), eq(user.branchId, 'b-A'))!)
    );
    const memberOrder = mocks.tx.query.user.findFirst.mock.invocationCallOrder[0];
    expect(mocks.tx.query.subscriptions.findFirst.mock.invocationCallOrder[0]).toBeGreaterThan(
      memberOrder
    );
    expect(mocks.getAdminUserClaimSummary.mock.invocationCallOrder[0]).toBeGreaterThan(memberOrder);
    expect(mocks.getAdminUserClaimSummary).toHaveBeenCalledWith({
      db: mocks.tx,
      recentClaimsLimit: 6,
      scope: { role: 'branch_manager', branchId: 'b-A' },
      tenantId: 't1',
      userId: 'u1',
    });
  });

  it('returns not_found without dependent reads when the branch predicate excludes the member', async () => {
    mocks.tx.query.user.findFirst.mockResolvedValue(undefined);
    expect(await load('branch_manager', 'b-A')).toEqual({ kind: 'not_found' });
    expect(memberLookup().params).toEqual(['u1', 't1', 'b-A']);
    expectNoDependentReads();
  });

  it.each([null, ''])(
    'denies a branch manager with branch %j before opening a transaction',
    async branchId => {
      expect(await load('branch_manager', branchId)).toEqual({ kind: 'not_found' });
      expectNoTransaction();
    }
  );

  it.each(['staff', 'agent', 'member', 'global_support', 'auditor', '', null])(
    'denies role %j before opening a transaction',
    async role => {
      expect(await load(role, 'b-A')).toEqual({ kind: 'not_found' });
      expectNoTransaction();
    }
  );

  it('returns not_found without a transaction when the tenant is missing', async () => {
    expect(await load('super_admin', null, null)).toEqual({ kind: 'not_found' });
    expectNoTransaction();
  });

  it('propagates tenant-context failures', async () => {
    mocks.withTenantContext.mockRejectedValueOnce(new Error('rls role not ready'));
    await expect(load('branch_manager', 'b-A')).rejects.toThrow('rls role not ready');
    expect(mocks.tx.query.user.findFirst).not.toHaveBeenCalled();
  });

  it('propagates member lookup failures without dependent reads', async () => {
    mocks.tx.query.user.findFirst.mockRejectedValueOnce(new Error('connection terminated'));
    await expect(load('tenant_admin', null)).rejects.toThrow('connection terminated');
    expectNoDependentReads();
  });

  it('propagates dependent read failures for an authorized member', async () => {
    mocks.getAdminUserClaimSummary.mockRejectedValueOnce(new Error('claims unavailable'));
    await expect(load('branch_manager', 'b-A')).rejects.toThrow('claims unavailable');
  });
});
