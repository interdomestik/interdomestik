import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  readBaseline,
  readReport,
  readText,
  runAppGuard,
  runGuard,
  writeEmptyBaseline,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

test('db access guard is wired into PR verification and full local checks', () => {
  const packageJson = JSON.parse(readText('package.json'));
  const baseline = JSON.parse(readText('scripts/ci/db-access-baseline.json'));

  assert.equal(packageJson.scripts['check:db-access'], 'node scripts/check-db-access-guard.mjs');
  assert.match(packageJson.scripts['check:all'], /pnpm check:db-access/);
  assert.match(packageJson.scripts['pr:verify'], /pnpm check:db-access/);
  assert.equal(baseline.version, 2);
  assert.ok(baseline.counts?.byTenantPosture);
  assert.ok(Array.isArray(baseline.entries));
  assert.ok(baseline.entries.length > 0);
});

test('db access guard fails only when direct db access is added beyond the baseline', () => {
  const tempRoot = createTempRepo();

  writeFixture(tempRoot, 'apps/web/src/features/example/existing.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function existing() {',
    '  return db.query.user.findFirst({ where: () => true });',
    '}',
  ]);

  const baselineResult = runAppGuard(tempRoot, ['--write-baseline']);
  assert.equal(baselineResult.status, 0, baselineResult.stderr);

  const passingResult = runAppGuard(tempRoot);
  assert.equal(passingResult.status, 0, passingResult.stderr);

  writeFixture(tempRoot, 'apps/web/src/features/example/new.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function newlyAdded() {',
    '  return db.select().from(user);',
    '}',
  ]);

  const failingResult = runAppGuard(tempRoot);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stderr, /new unclassified/u);
  assert.match(failingResult.stdout, /new\.ts:3 select/u);
});

test('db access guard catches multiline chains and new domain-package direct access', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/features/example/multiline.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function multiline() {',
    '  return db',
    '    .select()',
    '    .from(user);',
    '}',
  ]);
  writeFixture(tempRoot, 'packages/domain-example/src/unsafe-wrapper.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function unsafeDomainWrapper() {',
    '  return db.query.user.findMany({});',
    '}',
  ]);

  const failingResult = runGuard(tempRoot, [
    '--roots=apps/web/src,packages',
    '--baseline=db-access-baseline.json',
  ]);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stdout, /multiline\.ts:3 select/u);
  assert.match(failingResult.stdout, /unsafe-wrapper\.ts:3 query \[domain-wrapper\]/u);
});

test('db access guard excludes e2e-only API setup routes from production posture baseline', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/app/api/e2e/branches/_core.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function resetE2eBranches() {',
    '  await db.delete(branches);',
    '}',
  ]);

  const passingResult = runAppGuard(tempRoot);
  assert.equal(passingResult.status, 0, passingResult.stderr);
  const report = readReport(tempRoot);
  assert.equal(report.scannedCount, 0);
});

test('db access guard catches new transaction callback alias writes', () => {
  const tempRoot = createTempRepo();

  writeFixture(tempRoot, 'apps/web/src/features/example/existing.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function existing() {',
    '  return db.transaction(async tx => {',
    '    return tx.insert(existingTable).values({ id: "existing" });',
    '  });',
    '}',
  ]);

  const baselineResult = runAppGuard(tempRoot, ['--write-baseline']);
  assert.equal(baselineResult.status, 0, baselineResult.stderr);

  writeFixture(tempRoot, 'apps/web/src/features/example/new-transaction.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function newlyAdded() {',
    '  return db.transaction(async tx => {',
    '    await tx.update(user).set({ name: "new" });',
    '  });',
    '}',
  ]);

  const failingResult = runAppGuard(tempRoot);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stdout, /new-transaction\.ts:3 transaction/u);
  assert.match(failingResult.stdout, /new-transaction\.ts:4 update/u);
});

test('db access guard catches aliased db imports and local aliases', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/features/example/aliased.ts', [
    "import { db as database } from '@interdomestik/database';",
    'export async function aliasedImport() {',
    '  return database.select().from(user);',
    '}',
  ]);
  writeFixture(tempRoot, 'apps/web/src/features/example/assigned.ts', [
    "import { db } from '@/lib/db.server';",
    'const database = db;',
    'export async function assignedAlias() {',
    '  return database.query.user.findFirst({});',
    '}',
  ]);

  const failingResult = runAppGuard(tempRoot);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stdout, /aliased\.ts:3 select/u);
  assert.match(failingResult.stdout, /assigned\.ts:4 query/u);
});

test('db access guard ignores type-only typeof db method references', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/features/example/types.ts', [
    "import { db } from '@interdomestik/database';",
    'type QueryReference = typeof db.query.user;',
    'type UpdateReference = Awaited<ReturnType<typeof db.update>>;',
  ]);

  const passingResult = runAppGuard(tempRoot);
  assert.equal(passingResult.status, 0, passingResult.stderr);
});

test('db access guard classifies withTenantContext callback transaction aliases', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/features/example/tenant-context.ts', [
    "import { withTenantContext } from '@interdomestik/database';",
    'export async function tenantScoped(tenantId) {',
    '  return withTenantContext({ tenantId }, async tenantTx => tenantTx.select().from(user));',
    '}',
  ]);
  writeFixture(tempRoot, 'apps/web/src/features/example/tenant-context-block.ts', [
    "import { withTenantDb } from '@interdomestik/database';",
    'export async function tenantScopedBlock(tenantId) {',
    '  return withTenantDb({ tenantId }, async tx => {',
    '    await tx.transaction(async nestedTx => nestedTx.update(user).set({ name: "safe" }));',
    '    return tx.delete(user).where(eq(user.tenantId, tenantId));',
    '  });',
    '}',
  ]);

  const passingResult = runAppGuard(tempRoot);
  assert.equal(passingResult.status, 0, passingResult.stderr);
  const report = readReport(tempRoot);
  assert.equal(report.counts.byTenantPosture['tenant-context'], 4);
  assert.equal(report.newEntries.length, 4);
  assert.equal(report.failingNewEntries.length, 0);
  assert.ok(
    report.newEntries.some(
      entry => entry.tenantPostureReason === 'tenant-context: callback-tx-alias'
    )
  );
  assert.ok(
    report.newEntries.some(
      entry => entry.tenantPostureReason === 'tenant-context: callback-tx-block'
    )
  );
});

test('db access guard keeps plain db.transaction aliases as direct access', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/features/example/plain-transaction.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function unsafe() {',
    '  return db.transaction(async tx => {',
    '    await tx.update(user).set({ name: "unsafe" });',
    '  });',
    '}',
  ]);

  const failingResult = runAppGuard(tempRoot);
  assert.equal(failingResult.status, 1);
  const report = readReport(tempRoot);
  assert.equal(report.failingNewEntries.length, 2);
  assert.ok(
    report.failingNewEntries.every(
      entry => entry.tenantPostureReason === 'unclassified: no-recognized-context'
    )
  );
});

test('db access guard does not leak tenant context aliases outside callback boundaries', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/features/example/mixed-context.ts', [
    "import { db, withTenantContext } from '@interdomestik/database';",
    'export async function mixedContext(tenantId) {',
    '  await withTenantContext({ tenantId }, async tenantTx => tenantTx.select().from(user));',
    '  return db.transaction(async tx => {',
    '    await tx.update(user).set({ name: "unsafe" });',
    '  });',
    '}',
  ]);

  const failingResult = runAppGuard(tempRoot);
  assert.equal(failingResult.status, 1);
  const report = readReport(tempRoot);
  assert.equal(report.counts.byTenantPosture['tenant-context'], 1);
  assert.ok(
    report.failingNewEntries.some(
      entry => entry.callee === 'tx.update' && entry.tenantPosture === 'unclassified'
    )
  );
});

test('db access guard recognizes only same-statement tenant predicates with non-literal tenant ids', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/features/example/predicate-read.ts', [
    "import { db } from '@interdomestik/database';",
    "import { withTenant } from '@interdomestik/database/tenant-security';",
    'export async function safeRead(tenantId) {',
    '  return db.query.claims.findMany({',
    "    where: (table, { eq }) => withTenant(tenantId, table.tenantId, eq(table.status, 'open')),",
    '  });',
    '}',
  ]);

  const passingResult = runAppGuard(tempRoot);
  assert.equal(passingResult.status, 0, passingResult.stderr);
  assert.match(passingResult.stdout, /non-failing new direct DB access entries/u);
  let report = readReport(tempRoot);
  assert.equal(report.newEntries[0].tenantPosture, 'tenant-predicate');
  assert.equal(report.newEntries[0].tenantPostureReason, 'tenant-predicate: in-where-clause');

  writeFixture(tempRoot, 'apps/web/src/features/example/predicate-write.ts', [
    "import { db } from '@interdomestik/database';",
    "import { withTenant } from '@interdomestik/database/tenant-security';",
    'export async function unsafeWrite(tenantId) {',
    '  return db.update(claims).set({ status: "closed" }).where(withTenant(tenantId, claims.tenantId));',
    '}',
  ]);
  const writeFailingResult = runAppGuard(tempRoot);
  assert.equal(writeFailingResult.status, 1);
  report = readReport(tempRoot);
  assert.ok(
    report.failingNewEntries.some(
      entry =>
        entry.file.endsWith('predicate-write.ts') && entry.tenantPosture === 'tenant-predicate'
    )
  );
});

test('db access guard rejects hard-coded and split-statement tenant predicates', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/features/example/hard-coded.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function hardCoded() {',
    "  return db.select().from(claims).where(eq(claims.tenantId, 'tenant_ks'));",
    '}',
  ]);
  writeFixture(tempRoot, 'apps/web/src/features/example/split-statement.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function split(tenantId) {',
    '  const scope = eq(claims.tenantId, tenantId);',
    '  return db.select().from(claims).where(scope);',
    '}',
  ]);
  writeFixture(tempRoot, 'apps/web/src/features/example/wrong-with-tenant-column.ts', [
    "import { db } from '@interdomestik/database';",
    "import { withTenant } from '@interdomestik/database/tenant-security';",
    'export async function wrongColumn(tenantId) {',
    '  return db.query.claims.findMany({',
    '    where: () => withTenant(tenantId, claims.ownerId),',
    '  });',
    '}',
  ]);

  const failingResult = runAppGuard(tempRoot);
  assert.equal(failingResult.status, 1);
  const report = readReport(tempRoot);
  assert.equal(report.failingNewEntries.length, 3);
  assert.ok(report.failingNewEntries.every(entry => entry.tenantPosture === 'unclassified'));
});

test('db access guard supports explicit system-exempt directives and dbAdmin posture', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/app/api/example/system.ts', [
    "import { db, dbAdmin as adminDb } from '@interdomestik/database';",
    'export async function systemJob() {',
    '  // db-access-guard: system-exempt -- reason: cron iterates tenants from sealed list',
    '  await db.update(systemJobs).set({ status: "archived" });',
    '  await adminDb.delete(auditLog);',
    '}',
  ]);

  const passingResult = runAppGuard(tempRoot);
  assert.equal(passingResult.status, 0, passingResult.stderr);
  const report = readReport(tempRoot);
  assert.equal(report.counts.byTenantPosture['system-exempt'], 1);
  assert.equal(report.counts.byTenantPosture['admin-privileged'], 1);
  assert.equal(report.newEntries[0].tenantPostureDetail, 'cron iterates tenants from sealed list');
  assert.ok(
    report.newEntries.some(entry => entry.tenantPostureReason === 'admin-privileged: dbAdmin')
  );
});

test('db access guard supports explicit tenant-scoped directives with audit details', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/features/example/tenant-scoped.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function tenantScoped(tenantId) {',
    '  // db-access-guard: tenant-scoped -- reason: tenantId from validated function param tenantId',
    '  await db.insert(claims).values({ tenantId });',
    '}',
  ]);

  const passingResult = runAppGuard(tempRoot);
  assert.equal(passingResult.status, 0, passingResult.stderr);
  const report = readReport(tempRoot);
  assert.equal(report.counts.byTenantPosture['tenant-scoped'], 1);
  assert.equal(report.newEntries[0].tenantPostureReason, 'tenant-scoped: directive');
  assert.equal(
    report.newEntries[0].tenantPostureDetail,
    'tenantId from validated function param tenantId'
  );
});

test('db access guard writes v2 baselines with posture counts and per-entry posture fields', () => {
  const tempRoot = createTempRepo();
  writeFixture(tempRoot, 'apps/web/src/features/example/existing.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function existing(tenantId) {',
    '  return db.select().from(claims).where(eq(claims.tenantId, tenantId));',
    '}',
  ]);

  const baselineResult = runAppGuard(tempRoot, ['--write-baseline']);
  assert.equal(baselineResult.status, 0, baselineResult.stderr);
  const baseline = readBaseline(tempRoot);
  assert.equal(baseline.version, 2);
  assert.equal(baseline.policy, 'see docs/dev/db-access-guard.md');
  assert.equal(baseline.counts.byTenantPosture['tenant-predicate'], 1);
  assert.equal(baseline.entries[0].callee, 'db.select');
  assert.equal(baseline.entries[0].tenantPosture, 'tenant-predicate');
  assert.equal(baseline.entries[0].tenantPostureReason, 'tenant-predicate: in-where-clause');
});
