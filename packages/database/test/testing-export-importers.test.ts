import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const SPECIFIER = '@interdomestik/database/testing/claim-notification-cleanup';
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;

/** Test-only importers: browser specs and their fixtures, and test files. */
export function isTestOnlyImporter(file: string): boolean {
  return file.startsWith('apps/web/e2e/') || /\.test\.[cm]?[jt]sx?$/.test(file);
}

function trackedImporters(): string[] {
  const files = execFileSync('git', ['ls-files', '-z', '--', 'apps', 'packages', 'scripts'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(file => SOURCE.test(file) && !file.startsWith('packages/database/'));
  return files.filter(file => readFileSync(path.join(ROOT, file), 'utf8').includes(SPECIFIER));
}

test('the claim notification cleanup export is imported only by tests and browser specs', () => {
  const importers = trackedImporters();
  assert.ok(importers.length > 0, `expected at least one importer of ${SPECIFIER}`);
  assert.deepEqual(
    importers.filter(file => !isTestOnlyImporter(file)),
    [],
    `${SPECIFIER} deletes rows with the caller's client and is a test helper only`
  );
});

test('the importer rule refuses production paths', () => {
  for (const file of [
    'apps/web/src/actions/notifications.core.ts',
    'apps/web/src/app/api/cron/notifications/route.ts',
    'packages/domain-claims/src/claims/send-message.ts',
    'scripts/pilot/admin-users-unread.ts',
  ]) {
    assert.equal(isTestOnlyImporter(file), false, file);
  }
  for (const file of [
    'apps/web/e2e/gate/member-locale.fixture.ts',
    'scripts/pilot/admin-users-unread.test.ts',
    'packages/domain-claims/src/claims/submit.test.ts',
  ]) {
    assert.equal(isTestOnlyImporter(file), true, file);
  }
});
