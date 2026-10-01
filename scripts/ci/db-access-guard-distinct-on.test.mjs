import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  runGuard,
  writeEmptyBaseline,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

function scanFixture(relativePath, lines) {
  const root = createTempRepo();
  writeEmptyBaseline(root);
  writeFixture(root, relativePath, lines);
  const result = runGuard(root, [
    '--roots=apps/web/src,packages',
    '--baseline=db-access-baseline.json',
  ]);
  return { result, report: readReport(root) };
}

test('DISTINCT ON reads through aliased raw clients are inventoried and rejected', () => {
  const { result, report } = scanFixture('packages/domain-example/src/unsafe-history.ts', [
    "import { db as database } from '@interdomestik/database';",
    'const historyDb = database;',
    'export function readHistory() {',
    '  return historyDb',
    '    .selectDistinctOn([claimStageHistory.claimId], { note: claimStageHistory.note })',
    '    .from(claimStageHistory);',
    '}',
  ]);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(report.scannedCount, 1);
  assert.equal(report.failingNewEntries[0].method, 'selectDistinctOn');
  assert.equal(report.failingNewEntries[0].callee, 'historyDb.selectDistinctOn');
  assert.equal(report.failingNewEntries[0].tenantPosture, 'unclassified');
});

test('DISTINCT ON reads inside the tenant transaction retain recognized context', () => {
  const { result, report } = scanFixture('packages/domain-example/src/scoped-history.ts', [
    "import { withTenantContext as runScoped } from '@interdomestik/database';",
    'export function readHistory(tenantId) {',
    '  return runScoped({ tenantId }, async scopedTx => {',
    '    return scopedTx.selectDistinctOn([claimStageHistory.claimId], { note: claimStageHistory.note })',
    '      .from(claimStageHistory);',
    '  });',
    '}',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.scannedCount, 1);
  assert.equal(report.newEntries[0].method, 'selectDistinctOn');
  assert.equal(report.newEntries[0].tenantPosture, 'tenant-context');
  assert.equal(report.newEntries[0].tenantPostureReason, 'tenant-context: callback-tx-block');
  assert.deepEqual(report.failingNewEntries, []);
});
