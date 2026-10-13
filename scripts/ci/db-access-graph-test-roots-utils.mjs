import assert from 'node:assert/strict';
import {
  createTempRepo,
  readReport,
  runGuard,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

export const CANONICAL = 'import {db, claims} from "@interdomestik/database";';
export const LOADER_PAGE = 'apps/web/src/app/page.tsx';
export const LOADED_FIXTURE = 'apps/web/src/lib/handlers/x-fixture.ts';

const testNamed = file => /(?:\.test|\.test-support|-fixture)\.ts$/u.test(file);

// A changed test-named module is its own graph root, so its failing operation names that root.
export function rejectedTestOnly(file, lines, extra = {}) {
  const root = createTempRepo();
  for (const [other, body] of Object.entries(extra)) writeFixture(root, other, body);
  writeFixture(root, file, lines);
  const result = runGuard(root);
  const report = readReport(root);
  assert.equal(result.status, 1, JSON.stringify(report));
  assert.notEqual(report.status, 'pass');
  assert.ok(
    report.failingNewEntries.some(
      item => testNamed(item.file) && item.mountedFromAll?.includes(item.file)
    ),
    JSON.stringify(report)
  );
  return report;
}

// An unchanged, sealed product page loads handlers through a computed specifier; the guard
// cannot see that edge, so the new test-named handler must fail closed on its own.
export function behindUnchangedLoader(lines) {
  const root = createTempRepo();
  writeFixture(root, LOADER_PAGE, [
    'export default async function Page({name}:{name:string}){',
    '  return (await import(`../lib/handlers/${name}`)).default();',
    '}',
  ]);
  sealFixture(root);
  writeFixture(root, LOADED_FIXTURE, lines);
  const result = runGuard(root);
  const report = readReport(root);
  assert.equal(result.status, 1, JSON.stringify(report));
  assert.notEqual(report.status, 'pass');
  return report;
}
