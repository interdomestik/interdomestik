import type { SQL } from 'drizzle-orm';
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
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@interdomestik/database', () => ({
  db: { query: { user: { findFirst: mocks.importedFindFirst } } },
  withTenantContext: mocks.withTenantContext,
}));

import MemberNumberResolverPage from './page';

const tx = { query: { user: { findFirst: mocks.txFindFirst } } };

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

async function navigate(memberNumber = 'MEM-2026-000001', locale = 'sq'): Promise<string> {
  try {
    await MemberNumberResolverPage({ params: Promise.resolve({ locale, memberNumber }) });
  } catch (error) {
    if (error instanceof mocks.NavigationSignal) return error.target;
    throw error;
  }
  throw new Error('resolver returned without navigating');
}

function lookupParams(): unknown[] {
  const [{ where }] = mocks.txFindFirst.mock.calls[0] as [{ where: SQL }];
  return new PgDialect().sqlToQuery(where).params;
}

describe('MemberNumberResolverPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(session());
    mocks.withTenantContext.mockImplementation(
      async (_context: unknown, action: (t: typeof tx) => Promise<unknown>) => action(tx)
    );
    mocks.txFindFirst.mockResolvedValue({ id: 'user-1' });
  });

  it.each(['sq', 'mk', 'en', 'sr'])(
    'redirects %s to the localized canonical user via the access-tenant transaction',
    async locale => {
      expect(await navigate('MEM-2026-000001', locale)).toBe(
        `redirect:/${locale}/admin/users/user-1`
      );
      expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
      expect(mocks.withTenantContext.mock.calls[0][0]).toEqual({
        tenantId: 'tenant-access',
        role: 'tenant_admin',
      });
      expect(lookupParams()).toEqual(['MEM-2026-000001', 'tenant-access']);
      expect(mocks.importedFindFirst).not.toHaveBeenCalled();
    }
  );

  it('carries the actual session role for an allowed branch manager', async () => {
    mocks.getSession.mockResolvedValue(session({ role: 'branch_manager', branchId: 'b1' }));
    expect(await navigate()).toBe('redirect:/sq/admin/users/user-1');
    expect(mocks.withTenantContext.mock.calls[0][0]).toEqual({
      tenantId: 'tenant-access',
      role: 'branch_manager',
    });
  });

  it('falls back to the session tenant when no access tenant is present', async () => {
    mocks.getSession.mockResolvedValue(session({ accessTenantId: null }));
    expect(await navigate()).toBe('redirect:/sq/admin/users/user-1');
    expect(mocks.withTenantContext.mock.calls[0][0]).toEqual({
      tenantId: 'tenant-home',
      role: 'tenant_admin',
    });
  });

  it('redirects anonymous visitors to the localized login without a lookup', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(await navigate('MEM-2026-000001', 'mk')).toBe('redirect:/mk/login');
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it.each(['agent', 'staff', 'member', null])(
    'returns notFound without a lookup for role %s',
    async role => {
      mocks.getSession.mockResolvedValue(session({ role }));
      expect(await navigate()).toBe('notFound');
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    }
  );

  it.each(['INVALID', 'MEM-2026-1', 'mem-2026-000001', 'MEM-2026-000001 '])(
    'returns notFound without a lookup for malformed number %j',
    async memberNumber => {
      expect(await navigate(memberNumber)).toBe('notFound');
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    }
  );

  it('fails closed without a lookup when the session has no tenant scope', async () => {
    mocks.getSession.mockResolvedValue(session({ tenantId: null, accessTenantId: null }));
    await expect(navigate()).rejects.toThrow();
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('returns notFound when no member matches in the access tenant', async () => {
    mocks.txFindFirst.mockResolvedValue(undefined);
    expect(await navigate()).toBe('notFound');
    expect(mocks.txFindFirst).toHaveBeenCalledTimes(1);
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
