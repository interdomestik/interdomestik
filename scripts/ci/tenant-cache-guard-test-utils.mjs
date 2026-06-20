import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { findTenantCacheGuardViolations } from '../check-tenant-cache-guard.mjs';

export const TENANT_CACHE_AGENT_ROUTE = 'apps/web/src/app/[locale]/(agent)/agent/page.tsx';
export const TENANT_CACHE_MEMBER_ROUTE = 'apps/web/src/app/[locale]/(app)/member/claims/page.tsx';
export const TENANT_CACHE_STAFF_ROUTE = 'apps/web/src/app/[locale]/(staff)/staff/claims/page.ts';

export function tempTenantCacheRepo(prefix = 'tenant-cache-guard-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function writeTenantCacheFixture(root, relativePath, source) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${source.trim()}\n`);
}

export function writeUnstableCacheFixture(root, relativePath, source) {
  writeTenantCacheFixture(
    root,
    relativePath,
    `
      import { unstable_cache } from 'next/cache';
      ${source}
    `
  );
}

export function expectTenantCacheViolations(root, expected) {
  assert.deepEqual(findTenantCacheGuardViolations(root), expected);
}
