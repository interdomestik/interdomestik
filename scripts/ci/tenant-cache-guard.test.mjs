import assert from 'node:assert/strict';
import test from 'node:test';

import { runTenantCacheGuard } from '../check-tenant-cache-guard.mjs';
import {
  expectTenantCacheViolations,
  tempTenantCacheRepo,
  TENANT_CACHE_MEMBER_ROUTE,
  TENANT_CACHE_STAFF_ROUTE,
  writeTenantCacheFixture,
  writeUnstableCacheFixture,
} from './tenant-cache-guard-test-utils.mjs';

test('fails tenant route unstable_cache without access tenant key', () => {
  const root = tempTenantCacheRepo();
  writeUnstableCacheFixture(
    root,
    TENANT_CACHE_STAFF_ROUTE,
    `
      export const getClaims = unstable_cache(async () => [], ['claims']);
    `
  );

  expectTenantCacheViolations(root, [
    `${TENANT_CACHE_STAFF_ROUTE}:3 unstable_cache key set must include access_tenant_id`,
  ]);
});

test('requires member_id for member-scoped unstable_cache usage', () => {
  const root = tempTenantCacheRepo();
  writeUnstableCacheFixture(
    root,
    TENANT_CACHE_MEMBER_ROUTE,
    `
      export const getClaims = unstable_cache(async () => [], ['access_tenant_id', tenantId]);
    `
  );

  expectTenantCacheViolations(root, [
    `${TENANT_CACHE_MEMBER_ROUTE}:3 member unstable_cache key set must include member_id`,
  ]);
});

test('passes tenant and member keyed cache usage', () => {
  const root = tempTenantCacheRepo();
  writeUnstableCacheFixture(
    root,
    TENANT_CACHE_MEMBER_ROUTE,
    `
      export const getClaims = unstable_cache(
        async () => [],
        ['access_tenant_id', tenantId, 'member_id', memberId, 'claim_id', claimId]
      );
    `
  );

  expectTenantCacheViolations(root, []);
});

test('allows only explicitly allowlisted shared data caches', () => {
  const root = tempTenantCacheRepo();
  writeTenantCacheFixture(
    root,
    'apps/web/src/app/[locale]/admin/plans/page.ts',
    `
      import { unstable_cache } from 'next/cache';
      // tenant-cache-guard: shared-cache plan-catalogs
      export const getPlans = unstable_cache(async () => [], ['plans']);
    `
  );
  writeTenantCacheFixture(
    root,
    'apps/web/src/app/[locale]/admin/unsafe/page.ts',
    `
      import { unstable_cache } from 'next/cache';
      // tenant-cache-guard: shared-cache global-users
      export const getUsers = unstable_cache(async () => [], ['users']);
    `
  );

  expectTenantCacheViolations(root, [
    'apps/web/src/app/[locale]/admin/unsafe/page.ts:3 shared cache kind is not allowlisted: global-users',
    'apps/web/src/app/[locale]/admin/unsafe/page.ts:3 unstable_cache key set must include access_tenant_id',
  ]);
});

test('keeps shared-cache annotations scoped to the local call comments', () => {
  const root = tempTenantCacheRepo();
  writeTenantCacheFixture(
    root,
    'apps/web/src/app/[locale]/admin/mixed/page.ts',
    `
      import { unstable_cache } from 'next/cache';
      // tenant-cache-guard: shared-cache plan-catalogs
      export const getPlans = unstable_cache(async () => [], ['plans']);
      export const getTenantUsers = unstable_cache(async () => [], ['users']);
      const docs = 'tenant-cache-guard: shared-cache plan-catalogs';
    `
  );

  expectTenantCacheViolations(root, [
    'apps/web/src/app/[locale]/admin/mixed/page.ts:4 unstable_cache key set must include access_tenant_id',
  ]);
});

test('is wired cleanly against the current repository', () => {
  assert.equal(runTenantCacheGuard(process.cwd()), 0);
});
