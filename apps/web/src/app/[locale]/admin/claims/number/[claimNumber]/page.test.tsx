import { claims } from '@interdomestik/database/schema';
import { eq, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class NavigationSignal extends Error {
    constructor(readonly target: string) {
      super(target);
    }
  }
  return {
    NavigationSignal,
    getSession: vi.fn(),
    withTenantContext: vi.fn(),
    txFindFirst: vi.fn(),
    importedFindFirst: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new mocks.NavigationSignal(`redirect:${url}`);
  },
  notFound: () => {
    throw new mocks.NavigationSignal('notFound');
  },
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@interdomestik/database', () => ({
  db: { query: { claims: { findFirst: mocks.importedFindFirst } } },
  withTenantContext: mocks.withTenantContext,
}));
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

const tx = { query: { claims: { findFirst: mocks.txFindFirst } } };
const NUMBER = 'CLM-MK-2026-900001';

function session(user: Record<string, unknown> = {}) {
  return {
    session: { id: 'session-1' },
    user: {
      id: 'admin-1',
      role: 'tenant_admin',
      tenantId: 'tenant-home',
      accessTenantId: 'tenant-access',
      ...user,
    },
  };
}

async function navigate(claimNumber = NUMBER, locale = 'mk'): Promise<string> {
  try {
    await ClaimNumberResolverPage({ params: Promise.resolve({ locale, claimNumber }) });
  } catch (error) {
    if (error instanceof mocks.NavigationSignal) return error.target;
    throw error;
  }
  throw new Error('resolver returned without navigating');
}

function lookupParams(): unknown[] {
  const [{ where }] = mocks.txFindFirst.mock.calls[0] as [{ where: WhereBuilder }];
  return new PgDialect().sqlToQuery(where(claims, { eq })).params;
}

describe('ClaimNumberResolverPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(session());
    mocks.withTenantContext.mockImplementation(
      async (_context: unknown, action: (t: typeof tx) => Promise<unknown>) => action(tx)
    );
    mocks.txFindFirst.mockResolvedValue({ id: 'claim-1' });
  });

  it('redirects to the canonical claim with ref via the access-tenant transaction', async () => {
    expect(await navigate()).toBe(`redirect:/mk/admin/claims/claim-1?ref=${NUMBER}`);
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext.mock.calls[0][0]).toEqual({
      tenantId: 'tenant-access',
      role: 'tenant_admin',
    });
    expect(lookupParams()).toEqual(['tenant-access', NUMBER]);
    expect(mocks.importedFindFirst).not.toHaveBeenCalled();
  });

  it('keeps the submitted number as ref while looking up the normalized one', async () => {
    expect(await navigate('clm-mk-2026-900001', 'sq')).toBe(
      'redirect:/sq/admin/claims/claim-1?ref=clm-mk-2026-900001'
    );
    expect(lookupParams()).toEqual(['tenant-access', NUMBER]);
  });

  it('scopes a branch manager to the own branch with the actual role', async () => {
    mocks.getSession.mockResolvedValue(session({ role: 'branch_manager', branchId: 'b-own' }));
    expect(await navigate()).toBe(`redirect:/mk/admin/claims/claim-1?ref=${NUMBER}`);
    expect(mocks.withTenantContext.mock.calls[0][0]).toEqual({
      tenantId: 'tenant-access',
      role: 'branch_manager',
    });
    expect(lookupParams()).toEqual(['tenant-access', NUMBER, 'b-own']);
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

  it('fails closed without a lookup when the session has no tenant scope', async () => {
    mocks.getSession.mockResolvedValue(session({ tenantId: null, accessTenantId: null }));
    await expect(navigate()).rejects.toThrow();
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('returns notFound when no claim matches in the access tenant', async () => {
    mocks.txFindFirst.mockResolvedValue(undefined);
    expect(await navigate()).toBe('notFound');
  });

  it('propagates unexpected database failures instead of notFound', async () => {
    mocks.txFindFirst.mockRejectedValueOnce(new Error('connection terminated'));
    await expect(navigate()).rejects.toThrow('connection terminated');
  });

  it('propagates tenant-context failures without querying', async () => {
    mocks.withTenantContext.mockRejectedValueOnce(new Error('rls role not ready'));
    await expect(navigate()).rejects.toThrow('rls role not ready');
    expect(mocks.txFindFirst).not.toHaveBeenCalled();
  });
});
