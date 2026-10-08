import { claims } from '@interdomestik/database/schema';
import { eq, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  expectTenantContext,
  itFailsClosedAndPropagatesErrors,
  mocks,
  resetResolverMocks,
  runNavigation,
  session,
} from '@/test/number-resolver-page-fixtures';

// Real visibility rules, without loading the list/stats loaders re-exported by the index.
vi.mock('@/features/admin/claims/server', async () => {
  const actual = await vi.importActual('@/features/admin/claims/server/claimVisibility');
  return {
    canViewAdminClaims: actual.canViewAdminClaims,
    resolveClaimsVisibility: actual.resolveClaimsVisibility,
  };
});

import ClaimNumberResolverPage from './page';

type WhereBuilder = (c: typeof claims, ops: { eq: typeof eq }) => SQL;

const NUMBER = 'CLM-MK-2026-900001';

function navigate(claimNumber = NUMBER, locale = 'mk'): Promise<string> {
  return runNavigation(() =>
    ClaimNumberResolverPage({ params: Promise.resolve({ locale, claimNumber }) })
  );
}

function lookupParams(): unknown[] {
  const [{ where }] = mocks.txFindFirst.mock.calls[0] as [{ where: WhereBuilder }];
  return new PgDialect().sqlToQuery(where(claims, { eq })).params;
}

describe('ClaimNumberResolverPage', () => {
  beforeEach(() => {
    resetResolverMocks({ id: 'claim-1' });
  });

  it('redirects to the canonical claim with ref via the access-tenant transaction', async () => {
    expect(await navigate()).toBe(`redirect:/mk/admin/claims/claim-1?ref=${NUMBER}`);
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expectTenantContext('tenant-access', 'tenant_admin');
    expect(lookupParams()).toEqual([NUMBER, 'tenant-access', 'tenant-access']);
    expect(mocks.importedFindFirst).not.toHaveBeenCalled();
  });

  it('keeps the submitted number as ref while looking up the normalized one', async () => {
    expect(await navigate('clm-mk-2026-900001', 'sq')).toBe(
      'redirect:/sq/admin/claims/claim-1?ref=clm-mk-2026-900001'
    );
    expect(lookupParams()).toEqual([NUMBER, 'tenant-access', 'tenant-access']);
  });

  it('scopes a branch manager to the own branch with the actual role', async () => {
    mocks.getSession.mockResolvedValue(session({ role: 'branch_manager', branchId: 'b-own' }));
    expect(await navigate()).toBe(`redirect:/mk/admin/claims/claim-1?ref=${NUMBER}`);
    expectTenantContext('tenant-access', 'branch_manager');
    expect(lookupParams()).toEqual([NUMBER, 'tenant-access', 'tenant-access', 'b-own']);
  });

  it('returns notFound for an other-branch claim excluded by the branch predicate', async () => {
    mocks.getSession.mockResolvedValue(session({ role: 'branch_manager', branchId: 'b-own' }));
    mocks.txFindFirst.mockResolvedValue(undefined);
    expect(await navigate()).toBe('notFound');
    expect(lookupParams()).not.toContain('b-other');
  });

  it('returns notFound without a lookup for a branch manager missing a branch', async () => {
    mocks.getSession.mockResolvedValue(session({ role: 'branch_manager', branchId: null }));
    expect(await navigate()).toBe('notFound');
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('redirects anonymous visitors to the localized login without a lookup', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(await navigate(NUMBER, 'sq')).toBe('redirect:/sq/login');
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it.each(['staff', 'agent', 'member'])('returns notFound without a lookup for %s', async role => {
    mocks.getSession.mockResolvedValue(session({ role }));
    expect(await navigate()).toBe('notFound');
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it.each(['INVALID', 'CLM-MK-2026-%E0%A4%A'])(
    'returns notFound without a lookup for malformed input %j',
    async claimNumber => {
      expect(await navigate(claimNumber)).toBe('notFound');
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    }
  );

  it('returns notFound when no claim matches in the access tenant', async () => {
    mocks.txFindFirst.mockResolvedValue(undefined);
    expect(await navigate()).toBe('notFound');
  });

  itFailsClosedAndPropagatesErrors(() => navigate());
});
