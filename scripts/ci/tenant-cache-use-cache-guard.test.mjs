import test from 'node:test';

import {
  expectTenantCacheViolations,
  tempTenantCacheRepo,
  TENANT_CACHE_AGENT_ROUTE,
  TENANT_CACHE_MEMBER_ROUTE,
  writeTenantCacheFixture,
} from './tenant-cache-guard-test-utils.mjs';

test('catches use cache directives in protected route files', () => {
  const root = tempTenantCacheRepo('tenant-cache-use-cache-');
  writeTenantCacheFixture(
    root,
    TENANT_CACHE_AGENT_ROUTE,
    `
      export async function AgentPage() {
        'use cache';
        return null;
      }
    `
  );

  expectTenantCacheViolations(root, [
    `${TENANT_CACHE_AGENT_ROUTE}:2 use cache file must declare access_tenant_id in key set`,
  ]);
});

test('does not accept comments or strings as use cache tenant keys', () => {
  const root = tempTenantCacheRepo('tenant-cache-use-cache-');
  writeTenantCacheFixture(
    root,
    TENANT_CACHE_MEMBER_ROUTE,
    `
      export async function MemberClaims() {
        'use cache';
        // access_tenant_id member_id
        const label = 'access_tenant_id member_id';
        return label;
      }
    `
  );

  expectTenantCacheViolations(root, [
    `${TENANT_CACHE_MEMBER_ROUTE}:2 use cache file must declare access_tenant_id in key set`,
    `${TENANT_CACHE_MEMBER_ROUTE}:2 member use cache file must declare member_id in key set`,
  ]);
});

test('accepts code identifiers as use cache tenant key inputs', () => {
  const root = tempTenantCacheRepo('tenant-cache-use-cache-');
  writeTenantCacheFixture(
    root,
    TENANT_CACHE_MEMBER_ROUTE,
    `
      export async function MemberClaims({ accessTenantId, memberId }) {
        'use cache';
        return accessTenantId + memberId;
      }
    `
  );

  expectTenantCacheViolations(root, []);
});

test('accepts identifiers inside template literal interpolations', () => {
  const root = tempTenantCacheRepo('tenant-cache-use-cache-');
  writeTenantCacheFixture(
    root,
    TENANT_CACHE_MEMBER_ROUTE,
    `
      export async function MemberClaims({ accessTenantId, memberId }) {
        'use cache';
        return \`cache:\${accessTenantId}:\${memberId}\`;
      }
    `
  );

  expectTenantCacheViolations(root, []);
});
