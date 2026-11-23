import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const HELPER = 'packages/database/src/testing/claim-notification-cleanup.ts';
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
// Any module specifier that names the helper: the package export or a relative path to its file.
const REFERENCE = /['"`][^'"`\n]*testing\/claim-notification-cleanup(?:\.[cm]?[jt]s)?['"`]/;
// The seed cleanup removes the same rows before it deletes seeded claims, messages and users.
const SEED_CALLERS = new Set([
  'packages/database/src/seed-full/cleanup.ts',
  'packages/database/src/seed-utils/cleanup.ts',
  'packages/database/src/seed-utils/run-cleanup.ts',
]);

/** Allowed importers: browser specs and their fixtures, test files, and the seed cleanup. */
export function isAllowedImporter(file: string): boolean {
  return (
    file.startsWith('apps/web/e2e/') || /\.test\.[cm]?[jt]sx?$/.test(file) || SEED_CALLERS.has(file)
  );
}

function trackedImporters(): string[] {
  return execFileSync('git', ['ls-files', '-z', '--', 'apps', 'packages', 'scripts'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(file => SOURCE.test(file) && file !== HELPER)
    .filter(file => REFERENCE.test(readFileSync(path.join(ROOT, file), 'utf8')));
}

test('the claim notification cleanup helper is imported only by tests, browser specs and the seed cleanup', () => {
  const importers = trackedImporters();
  assert.ok(importers.length > 0, 'expected at least one importer of the cleanup helper');
  for (const caller of SEED_CALLERS) assert.ok(importers.includes(caller), caller);
  assert.deepEqual(
    importers.filter(file => !isAllowedImporter(file)),
    [],
    'the cleanup helper deletes rows with the caller client and is a test helper only'
  );
});

test('the importer rule refuses production paths, including the database package', () => {
  for (const file of [
    'apps/web/src/actions/notifications.core.ts',
    'apps/web/src/app/api/cron/notifications/route.ts',
    'packages/domain-claims/src/claims/send-message.ts',
    'packages/database/src/index.ts',
    'packages/database/src/schema.ts',
    'packages/database/src/seed-utils/seed-ids.ts',
    'scripts/pilot/admin-users-unread.ts',
  ]) {
    assert.equal(isAllowedImporter(file), false, file);
  }
  for (const file of [
    'apps/web/e2e/gate/member-locale.fixture.ts',
    'scripts/pilot/admin-users-unread.test.ts',
    'packages/database/test/seed-notification-cleanup.test.ts',
    'packages/database/src/seed-utils/cleanup.ts',
  ]) {
    assert.equal(isAllowedImporter(file), true, file);
  }
});

test('the reference pattern matches the export and relative paths, not look-alikes', () => {
  for (const line of [
    "import { cleanupClaimNotificationRows } from '@interdomestik/database/testing/claim-notification-cleanup';",
    "import { cleanupClaimNotificationRows } from './testing/claim-notification-cleanup';",
    "export * from '../src/testing/claim-notification-cleanup.ts';",
    'await import(`@interdomestik/database/testing/claim-notification-cleanup`);',
  ]) {
    assert.match(line, REFERENCE, line);
  }
  assert.doesNotMatch("import { x } from './testing/claim-notification-cleanup-copy';", REFERENCE);
});
