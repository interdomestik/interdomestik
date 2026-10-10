import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  readText,
  rootDir,
  runGuard,
  scan,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

const ambient = [
  'import { db } from "@interdomestik/database";',
  'export function old() { return db.query.user.findFirst({ where: () => true }); }',
];

test('existing guard remains selected by mandatory lanes and baseline bytes stay historical', () => {
  const pkg = JSON.parse(readText('package.json'));
  assert.equal(pkg.scripts['check:db-access'], 'node scripts/check-db-access-guard.mjs');
  assert.match(pkg.scripts['pr:verify'], /pnpm check:db-access/u);
  assert.match(pkg.scripts['check:all'], /pnpm check:db-access/u);
  assert.equal(JSON.parse(readText('scripts/ci/db-access-baseline.json')).entries.length, 604);
});

test('unchanged old operations retain debt without rebaselining; new ambient operations fail', () => {
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/old.ts', ambient);
  sealFixture(root);
  assert.equal(runGuard(root).status, 0);
  writeFixture(root, 'apps/web/src/new.ts', ambient);
  assert.equal(runGuard(root).status, 1);
  assert.ok(readReport(root).failingNewEntries.some(entry => entry.file.endsWith('new.ts')));
});

test('full multiline predicate, owner, role, control and duplicate changes invalidate historical identity', () => {
  const original = [
    'import { db } from "@interdomestik/database";',
    'export function read(owner, role) {',
    ' if (role !== "admin") throw Error("denied");',
    ' return db.select()',
    ' .from(user).where(eq(user.owner, owner));',
    '}',
  ];
  for (const revised of [
    original.join('\n').replace('eq(user.owner, owner)', 'true'),
    original.join('\n').replace('role !== "admin"', 'false'),
    original.join('\n').replace('owner));', '"foreign"));'),
    original.join('\n') + '\nexport function duplicate(){ return db.select().from(user); }',
  ]) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/old.ts', original);
    sealFixture(root);
    writeFixture(root, 'apps/web/src/old.ts', revised);
    assert.equal(runGuard(root).status, 1, revised);
  }
});

test('comments, formatting and erased type-only edits preserve unchanged debt', () => {
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/old.ts', ambient);
  sealFixture(root);
  writeFixture(root, 'apps/web/src/old.ts', [
    '// comment',
    'import { db } from "@interdomestik/database";',
    'type OnlyType = string;',
    'export function old(): unknown {',
    'return db.query.user.findFirst({where:()=>true});',
    '}',
  ]);
  assert.equal(runGuard(root).status, 0);
});

test('changes to referenced query constants invalidate consumers', () => {
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/predicate.ts', 'export const admitted = true;');
  writeFixture(root, 'apps/web/src/old.ts', [
    'import { db } from "@interdomestik/database";',
    'import { admitted } from "./predicate";',
    'export function old() { return db.select().from(user).where(admitted); }',
  ]);
  sealFixture(root);
  writeFixture(root, 'apps/web/src/predicate.ts', 'export const admitted = false;');
  assert.equal(runGuard(root).status, 1);
});

test('new tenant predicates and directives provide no transaction exemption', () => {
  for (const directive of [
    '',
    '// db-access-guard: system-exempt -- reason: candidate approval',
    '// db-access-guard: tenant-scoped -- reason: local assertion',
  ]) {
    const { result, report } = scan([
      'import { db } from "@interdomestik/database";',
      'export function read(tenantId) {',
      directive,
      'return db.select().from(user).where(eq(user.tenantId, tenantId));',
      '}',
    ]);
    assert.equal(result.status, 1);
    assert.equal(report.failingNewCount, 1);
  }
});

test('candidate baseline cannot wash debt or new operations', () => {
  const root = createTempRepo();
  writeFixture(root, 'scripts/ci/db-access-baseline.json', '{"entries":[{"permission":"all"}]}');
  assert.equal(runGuard(root).status, 1);
  assert.match(readReport(root).incomplete[0].reason, /baseline modified/u);
});

test('all four critical helper bodies are protected, independently of export/callsite spelling', () => {
  for (const file of ['tenant', 'db', 'rls-role-assertion', 'rls-role-readiness']) {
    const root = createTempRepo();
    writeFixture(root, `packages/database/src/${file}.ts`, 'export const degraded = true;');
    assert.equal(runGuard(root).status, 1);
    assert.match(readReport(root).incomplete[0].reason, /critical tenant helper/u);
  }
});

test('missing/wrong trusted commit, tree or blob digest fails incomplete', () => {
  for (const field of ['commit', 'tree', 'digest']) {
    const root = createTempRepo();
    const adoption = JSON.parse(requireText(root, '.fixture-adoption.json'));
    if (field === 'digest') adoption.files['packages/database/src/tenant.ts'] = '0'.repeat(64);
    else adoption[field] = '0'.repeat(40);
    writeFixture(root, '.fixture-adoption.json', JSON.stringify(adoption));
    assert.equal(runGuard(root).status, 1);
    assert.equal(readReport(root).status, 'incomplete');
  }
});

function requireText(root, file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('production CLI rejects trust/root/baseline/roots overrides and write-baseline', () => {
  const root = createTempRepo();
  for (const arg of [
    '--trust=HEAD',
    '--root=.',
    '--baseline=custom.json',
    '--roots=apps',
    '--write-baseline',
  ]) {
    const result = spawnSync(
      process.execPath,
      [path.join(rootDir, 'scripts/check-db-access-guard.mjs'), arg],
      { cwd: root, encoding: 'utf8' }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unsupported guard override/u);
  }
});

test('actual production CLI authenticates root epoch and preserves604 original entries', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-db-access-guard.mjs', '--report=tmp/db-access-guard/production-contract.json'],
    { cwd: rootDir, encoding: 'utf8', timeout: 90000 }
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(readText('tmp/db-access-guard/production-contract.json'));
  assert.equal(report.trustedCommit, '278e33ab0dd448547fa81d4b0ff122b4d69c901e');
  assert.equal(report.trustedTree, '4f9330417466b4f7bee68349e7183db22a5260ff');
  assert.equal(
    report.historicalBaselineSha256,
    '438b856b913d2946088b9c0f925dd07818b81ea82bad8d3468c2470a2f1131e9'
  );
});

test('unrelated executable presentation edits conservatively invalidate ambient debt (explicit epoch-A limit)', () => {
  const root = createTempRepo();
  const body = [...ambient, 'export const heading = "Before";'];
  writeFixture(root, 'apps/web/src/old.ts', body);
  sealFixture(root);
  writeFixture(root, 'apps/web/src/old.ts', body.join('\n').replace('Before', 'After'));
  assert.equal(runGuard(root).status, 1);
  assert.match(readReport(root).limits[0], /conservatively invalidate/u);
});

test('remediation and removal of historical ambient debt are positive changes', () => {
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/old.ts', ambient);
  sealFixture(root);
  writeFixture(root, 'apps/web/src/old.ts', [
    'import {withTenantContext} from "@interdomestik/database";',
    'export function old(t){return withTenantContext(t,async tx=>tx.query.user.findFirst({}));}',
  ]);
  assert.equal(runGuard(root).status, 0);
  writeFixture(root, 'apps/web/src/old.ts', 'export function old(){return null;}');
  assert.equal(runGuard(root).status, 0);
});

test('formerly scoped predicate, context role and terminating admission weakening cannot inherit safe posture', () => {
  for (const [oldValue, newValue] of [
    ['eq(user.owner,owner)', 'true'],
    ['role:"member"', 'role:"admin"'],
    ['if(!admitted)throw Error("deny");', ''],
  ]) {
    const root = createTempRepo();
    const original = [
      'import {withTenantContext} from "@interdomestik/database";',
      'export function read(tenantId,owner,admitted){if(!admitted)throw Error("deny"); return withTenantContext({tenantId,role:"member"},async tx=>tx.select().from(user).where(eq(user.owner,owner)));}',
    ];
    writeFixture(root, 'apps/web/src/old.ts', original);
    sealFixture(root);
    writeFixture(root, 'apps/web/src/old.ts', original.join('\n').replace(oldValue, newValue));
    assert.equal(runGuard(root).status, 1);
    assert.ok(
      readReport(root).failingNewEntries.some(entry =>
        /scoped executable controls/u.test(entry.reason ?? '')
      )
    );
  }
});

test('candidate tsconfig paths and environment trust selectors cannot counterfeit root context', () => {
  const root = createTempRepo();
  writeFixture(
    root,
    'apps/web/tsconfig.json',
    JSON.stringify({ compilerOptions: { paths: { '@interdomestik/database': ['./src/fake.ts'] } } })
  );
  assert.equal(runGuard(root).status, 1);
  assert.match(readReport(root).incomplete[0].reason, /resolver boundary.*tsconfig/u);
  const result = spawnSync(
    process.execPath,
    [path.join(rootDir, 'scripts/check-db-access-guard.mjs')],
    { cwd: root, encoding: 'utf8', env: { ...process.env, DB_ACCESS_GUARD_TRUST_ROOT: 'HEAD' } }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /environment override/u);
});

test('candidate symlinks and self-authored exclusion catalogs cannot hide source', () => {
  const root = createTempRepo();
  fs.mkdirSync(path.join(root, 'apps/web/src'), { recursive: true });
  fs.symlinkSync('/etc/passwd', path.join(root, 'apps/web/src/escape.ts'));
  assert.equal(runGuard(root).status, 1);
  assert.match(readReport(root).incomplete[0].reason, /symlink/u);
  const catalog = createTempRepo();
  writeFixture(catalog, 'scripts/ci/db-access-constants.mjs', 'export const DIRECT_DB_METHODS=[];');
  writeFixture(catalog, 'scripts/ci/db-access-catalog.json', '{"approved":["*"]}');
  writeFixture(catalog, 'apps/web/src/new.ts', ambient);
  assert.equal(runGuard(catalog).status, 1);
});
