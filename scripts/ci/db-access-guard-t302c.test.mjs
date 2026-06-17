import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const guardScript = fileURLToPath(
  new URL('../../scripts/check-db-access-guard.mjs', import.meta.url)
);

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-db-access-t302c-'));
}

function writeFixture(tempRoot, relativePath, lines) {
  const fixturePath = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, [...lines, ''].join('\n'));
}

function writeEmptyBaseline(tempRoot) {
  fs.writeFileSync(
    path.join(tempRoot, 'db-access-baseline.json'),
    JSON.stringify({ version: 2, entries: [] }, null, 2)
  );
}

function readReport(tempRoot) {
  return JSON.parse(
    fs.readFileSync(path.join(tempRoot, 'tmp/db-access-guard/report.json'), 'utf8')
  );
}

function runGuard(tempRoot, roots) {
  const args = [guardScript, `--roots=${roots}`, '--baseline=db-access-baseline.json'];
  return spawnSync(process.execPath, args, { cwd: tempRoot, encoding: 'utf8' });
}

function scanFixture(roots, relativePath, lines) {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, relativePath, lines);
  const result = runGuard(tempRoot, roots);
  return { result, report: readReport(tempRoot) };
}

function scanWeb(relativePath, lines) {
  return scanFixture('apps/web/src', `apps/web/src/${relativePath}`, lines);
}

function scanPackages(relativePath, lines) {
  return scanFixture('packages', `packages/${relativePath}`, lines);
}

function assertFailingFile(report, fileName) {
  assert.ok(report.failingNewEntries.some(entry => entry.file.endsWith(fileName)));
}

test('T-302c classifies aliased raw dbRls imports as privileged', () => {
  const { result, report } = scanWeb('app/api/example/raw-rls.ts', [
    "import { dbRls as rawRlsDb } from '@interdomestik/database';",
    'const assignedRawRlsDb = rawRlsDb;',
    'export async function rawRlsRead() { return assignedRawRlsDb.select().from(user); }',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.newEntries[0].tenantPostureReason, 'admin-privileged: dbRls');
});

test('T-302c classifies dbRls transaction callback aliases as privileged', () => {
  const { result, report } = scanWeb('app/api/example/raw-rls-transaction.ts', [
    "import { dbRls } from '@interdomestik/database';",
    'export async function rawRlsTransactionRead() {',
    '  return dbRls.transaction(async tx => tx.select().from(user));',
    '}',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    report.newEntries.some(
      entry =>
        entry.callee === 'tx.select' && entry.tenantPostureReason === 'admin-privileged: dbRls'
    )
  );
});

test('T-302c rejects new raw privileged clients outside approved paths', () => {
  const { result, report } = scanWeb('features/example/raw-admin.ts', [
    "import { dbAdmin } from '@interdomestik/database';",
    'export async function rawAdminRead() { return dbAdmin.select().from(user); }',
  ]);

  assert.equal(result.status, 1);
  assert.equal(report.failingNewEntries[0].tenantPostureReason, 'admin-privileged: dbAdmin');
});

test('T-302c blocks new claim updates outside the transition command', () => {
  const { result, report } = scanPackages('domain-claims/src/claims/not-transition.ts', [
    "import { db, claims } from '@interdomestik/database';",
    'export async function unsafeClaimWrite() {',
    '  // db-access-guard: tenant-scoped -- reason: legacy helper provided tenant proof',
    '  return db.update(claims);',
    '}',
  ]);

  assert.equal(result.status, 1);
  assertFailingFile(report, 'not-transition.ts');
});

test('T-302c blocks aliased direct claim updates outside the transition command', () => {
  const { result, report } = scanPackages('domain-claims/src/claims/aliased-not-transition.ts', [
    "import { db, claims as claimRows } from '@interdomestik/database';",
    'const directDb = db;',
    'export async function unsafeAliasedClaimWrite() {',
    '  // db-access-guard: tenant-scoped -- reason: legacy helper provided tenant proof',
    '  return directDb.update(claimRows);',
    '}',
  ]);

  assert.equal(result.status, 1);
  assertFailingFile(report, 'aliased-not-transition.ts');
});

test('T-302c blocks privileged client claim updates even in approved API paths', () => {
  const { result, report } = scanWeb('app/api/example/raw-claim-transition.ts', [
    "import { dbAdmin, claims } from '@interdomestik/database';",
    'export async function unsafePrivilegedClaimWrite() { return dbAdmin.update(claims); }',
  ]);

  assert.equal(result.status, 1);
  assertFailingFile(report, 'raw-claim-transition.ts');
});

test('T-302c blocks schema-qualified direct claim updates outside the transition command', () => {
  const { result, report } = scanPackages('domain-claims/src/claims/schema-qualified.ts', [
    "import { db } from '@interdomestik/database';",
    "import * as schema from '@interdomestik/database/schema';",
    'export async function unsafeSchemaClaimWrite() {',
    '  // db-access-guard: tenant-scoped -- reason: legacy helper provided tenant proof',
    '  return db.update(schema.claims);',
    '}',
  ]);

  assert.equal(result.status, 1);
  assertFailingFile(report, 'schema-qualified.ts');
});
