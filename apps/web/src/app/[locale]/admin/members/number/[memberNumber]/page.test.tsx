import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectTenantContext,
  itFailsClosedAndPropagatesErrors,
  mocks,
  resetResolverMocks,
  runNavigation,
  session,
} from '@/test/number-resolver-page-fixtures';

import MemberNumberResolverPage from './page';

function navigate(memberNumber = 'MEM-2026-000001', locale = 'sq'): Promise<string> {
  return runNavigation(() =>
    MemberNumberResolverPage({ params: Promise.resolve({ locale, memberNumber }) })
  );
}

function lookupParams(): unknown[] {
  const [{ where }] = mocks.txFindFirst.mock.calls[0] as [{ where: SQL }];
  return new PgDialect().sqlToQuery(where).params;
}

describe('MemberNumberResolverPage', () => {
  beforeEach(() => {
    resetResolverMocks({ id: 'user-1' });
  });

  it.each(['sq', 'mk', 'en', 'sr'])(
    'redirects %s to the localized canonical user via the access-tenant transaction',
    async locale => {
      expect(await navigate('MEM-2026-000001', locale)).toBe(
        `redirect:/${locale}/admin/users/user-1`
      );
      expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
      expectTenantContext('tenant-access', 'tenant_admin');
      expect(lookupParams()).toEqual(['MEM-2026-000001', 'tenant-access']);
      expect(mocks.importedFindFirst).not.toHaveBeenCalled();
    }
  );

  it('carries the actual session role and branch for an allowed branch manager', async () => {
    mocks.getSession.mockResolvedValue(session({ role: 'branch_manager', branchId: 'b1' }));
    expect(await navigate()).toBe('redirect:/sq/admin/users/user-1');
    expectTenantContext('tenant-access', 'branch_manager');
    expect(lookupParams()).toEqual(['MEM-2026-000001', 'tenant-access', 'b1']);
  });

  it('returns notFound when the branch-scoped lookup excludes the member', async () => {
    mocks.getSession.mockResolvedValue(session({ role: 'branch_manager', branchId: 'b1' }));
    mocks.txFindFirst.mockResolvedValue(undefined);
    expect(await navigate('MEM-2026-000001', 'mk')).toBe('notFound');
    expect(lookupParams()).toEqual(['MEM-2026-000001', 'tenant-access', 'b1']);
  });

  it.each([null, ''])(
    'returns notFound without a lookup for a branch manager with branch %j',
    async branchId => {
      mocks.getSession.mockResolvedValue(session({ role: 'branch_manager', branchId }));
      expect(await navigate()).toBe('notFound');
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    }
  );

  it('keeps admin lookups tenant-wide when the session carries a branch', async () => {
    mocks.getSession.mockResolvedValue(session({ role: 'tenant_admin', branchId: 'b1' }));
    expect(await navigate()).toBe('redirect:/sq/admin/users/user-1');
    expect(lookupParams()).toEqual(['MEM-2026-000001', 'tenant-access']);
  });

  it('falls back to the session tenant when no access tenant is present', async () => {
    mocks.getSession.mockResolvedValue(session({ accessTenantId: null }));
    expect(await navigate()).toBe('redirect:/sq/admin/users/user-1');
    expectTenantContext('tenant-home', 'tenant_admin');
  });

  it('redirects anonymous visitors to the localized login without a lookup', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(await navigate('MEM-2026-000001', 'mk')).toBe('redirect:/mk/login');
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it.each(['agent', 'staff', 'member', 'global_support', 'auditor', null])(
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

  it('returns notFound when no member matches in the access tenant', async () => {
    mocks.txFindFirst.mockResolvedValue(undefined);
    expect(await navigate()).toBe('notFound');
    expect(mocks.txFindFirst).toHaveBeenCalledTimes(1);
  });

  itFailsClosedAndPropagatesErrors(() => navigate());
});
