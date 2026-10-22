import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createTempRepo, writeFixture, sealFixture } from './db-access-guard-test-utils.mjs';
import { evaluateGuard } from './db-access-evaluator.mjs';
import { digest } from './db-access-trust.mjs';
import { providerUnitAnalysisModel } from './db-access-provider-unit-source.mjs';
import { inspectChangedEdges } from './db-access-graph.mjs';

const DB = 'packages/database/src/db.ts';
const HELPER = 'packages/database/src/provider-helper.ts';
const OLD = 'apps/web/src/old-provider-consumer.ts';
const PREDICATE = 'apps/web/src/consumer-predicate.ts';
const BASELINE = 'scripts/ci/db-access-baseline.json';
function setup(scoped = false) {
  const root = createTempRepo();
  writeFixture(root, PREDICATE, 'export const predicate = true;');
  writeFixture(root, OLD, [
    'import { db, withTenantContext } from "@interdomestik/database";',
    'import { predicate } from "./consumer-predicate";',
    scoped
      ? 'export async function read(role) { if (role !== "admin") return []; return withTenantContext({tenantId:"a"},async tx=>{await tx.execute("select 1");return [];}); }'
      : 'export function read() { return db.select().where(predicate); }',
  ]);
  sealFixture(root);
  const adoption = JSON.parse(fs.readFileSync(path.join(root, '.fixture-adoption.json')));
  writeFixture(root, DB, [
    'import { marker } from "./provider-helper";',
    'export const db = {} as any;',
    'export const dbRls = {} as any;',
    'export const dbAdmin = {} as any;',
    'export function catalog() { marker; return dbRls.execute("catalog-only"); }',
  ]);
  writeFixture(root, HELPER, 'export const marker = 1;');
  const record = file => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { sha256: digest(bytes), bytes: bytes.length, mode: '100644' };
  };
  const names = [...adoption.critical, HELPER];
  const policy = {
    version: 1,
    id: 'fixture-provider-transition',
    adoptionCommit: adoption.commit,
    adoptionTree: adoption.tree,
    baselineSha256: adoption.files[BASELINE],
    baselineBytes: record(BASELINE).bytes,
    files: Object.fromEntries(
      names.map(file => [
        file,
        {
          ...record(file),
          local: file === DB ? [HELPER] : [],
          external: [],
        },
      ])
    ),
    resolverFiles: { 'packages/database/package.json': record('packages/database/package.json') },
    publicModules: [DB, 'packages/database/src/tenant.ts'],
    testHarness: {},
    runtimeEnforcement: {
      id: 'fixture-runtime',
      mode: 'required-direct-execution',
      requiredTests: 9,
      acceptedReceiptInputs: false,
    },
  };
  return { root, adoption, policy, evaluate: () => evaluateGuard(root, adoption, policy) };
}

test('exact finite transition completes residual evaluation without resetting debt', () => {
  const f = setup(),
    report = f.evaluate();
  assert.equal(report.status, 'pass', JSON.stringify(report.incomplete));
  assert.equal(report.trustedCommit, f.adoption.commit);
  assert.equal(report.baselineCount, 0);
  assert.equal(report.providerUnit.runtimeAdmission, false);
  assert.equal(report.providerUnit.runtimeProducerRequired.acceptedReceiptInputs, false);
  assert.ok(
    report.providerUnit.obligations.some(
      row => row.file === DB && row.method === 'execute' && row.historicalDebt === false
    )
  );
  assert.ok(report.newEntries.every(row => row.file !== OLD));
});

test('independently changed unsafe consumer dependency still invalidates ordinary debt', () => {
  const f = setup();
  writeFixture(f.root, PREDICATE, 'export const predicate = false;');
  const report = f.evaluate();
  assert.notEqual(report.status, 'pass');
  assert.ok(report.failingNewEntries.some(row => row.file === OLD));
});

test('consumer executable edits remain ordinary failures', () => {
  const f = setup();
  writeFixture(
    f.root,
    OLD,
    'import { db } from "@interdomestik/database"; export function read(){return db.delete("foreign");}'
  );
  const report = f.evaluate();
  assert.notEqual(report.status, 'pass');
  assert.ok(report.failingNewEntries.some(row => row.file === OLD));
});

test('provider dependency and same-signature unsafe body changes refuse integrity', () => {
  for (const source of [
    'export const marker = 2;',
    'export const marker = process.env.PRIVATE_DATA;',
  ]) {
    const f = setup();
    writeFixture(f.root, HELPER, source);
    assert.throws(f.evaluate, /provider unit source\/mode mismatch/);
  }
});

test('a production deep import into a private provider dependency refuses', () => {
  const f = setup();
  writeFixture(
    f.root,
    'apps/web/src/private-access.ts',
    'import { marker } from "../../../packages/database/src/provider-helper"; export const value=marker;'
  );
  assert.throws(f.evaluate, /unauthorized incoming import/);
});

test('unresolved dynamic consumer work remains incomplete', () => {
  const f = setup();
  writeFixture(
    f.root,
    'apps/web/src/dynamic.ts',
    'export function execute(){return new Function("return 1")();}'
  );
  assert.equal(f.evaluate().status, 'incomplete');
});

test('changed scoped consumer controls keep their original obligation', () => {
  const f = setup(true);
  const full = path.join(f.root, OLD);
  fs.writeFileSync(full, fs.readFileSync(full, 'utf8').replace('role !== "admin"', 'false'));
  const report = f.evaluate();
  assert.notEqual(report.status, 'pass');
  assert.ok(
    report.failingNewEntries.some(
      row => row.file === OLD && /scoped executable controls/.test(row.reason)
    )
  );
});

test('forged or serialized boundary records cannot cut analysis or graph work', () => {
  const forged = { files: [DB, HELPER], runtimeAdmission: true };
  assert.throws(() => providerUnitAnalysisModel({}, forged), /unauthenticated analysis boundary/);
  assert.throws(
    () => inspectChangedEdges({}, {}, {}, [], forged),
    /unauthenticated provider graph boundary/
  );
});
