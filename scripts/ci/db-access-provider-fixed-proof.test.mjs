import { OLD, PREDICATE, setup } from './db-access-provider-test-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { writeFixture } from './db-access-guard-test-utils.mjs';
import { digest } from './db-access-trust.mjs';

const TEST = 'packages/database/test/rls-role-posture-query.test.ts';
const FIXTURE = 'packages/database/test/rls-role-posture-query.fixture.ts';
function proofSetup() {
  const f = setup();
  writeFixture(f.root, FIXTURE, 'process.env.PROOF_ONLY="owned"; export const marker=1;');
  writeFixture(
    f.root,
    TEST,
    'import {marker} from "./rls-role-posture-query.fixture"; export const observed=marker;'
  );
  const record = file => {
    const b = fs.readFileSync(path.join(f.root, file));
    return { sha256: digest(b), bytes: b.length, mode: '100644' };
  };
  f.policy.runtimeFiles = { [TEST]: record(TEST), [FIXTURE]: record(FIXTURE) };
  f.policy.runtimeProofBoundary = { id: 's8-fixed-role-proof-v1', entry: TEST };
  return f;
}
test('fixed proof completes static residual only with explicit direct runtime obligation', () => {
  const f = proofSetup(),
    r = f.evaluate();
  assert.equal(r.status, 'pass', JSON.stringify(r.incomplete));
  assert.equal(r.providerUnit.runtimeAdmission, false);
  assert.equal(r.providerUnit.producerHarnessObligations.length, 2);
  assert.ok(r.providerUnit.producerHarnessObligations.every(x => x.historicalDebt === false));
});
test('without fixed proof boundary ordinary mutable environment remains incomplete', () => {
  const f = proofSetup();
  delete f.policy.runtimeProofBoundary;
  assert.notEqual(f.evaluate().status, 'pass');
});
test('changed fixed proof body cannot inherit the source-bound obligation', () => {
  const f = proofSetup();
  writeFixture(f.root, TEST, 'process.env.PROOF_ONLY="changed";');
  assert.throws(
    () => f.evaluate(),
    error => error.message.includes('source/mode mismatch')
  );
});
test('production cannot import the exact fixed producer fixture', () => {
  const f = proofSetup();
  writeFixture(
    f.root,
    'apps/web/src/production.ts',
    'import {marker} from "../../../packages/database/test/rls-role-posture-query.fixture"; export const read=()=>marker;'
  );
  assert.throws(() => f.evaluate(), /ordinary consumer imports fixed producer harness/);
});
test('another test cannot import the fixed proof as a business helper', () => {
  const f = proofSetup();
  writeFixture(
    f.root,
    'packages/database/test/another.test.ts',
    'import {marker} from "./rls-role-posture-query.fixture"; export const read=()=>marker;'
  );
  assert.throws(() => f.evaluate(), /ordinary consumer imports fixed producer harness/);
});
test('unrelated test UNKNOWN remains unsupported', () => {
  const f = proofSetup();
  writeFixture(
    f.root,
    'apps/web/src/unrelated.test.ts',
    'process.env.ARBITRARY="changed"; export const value=1;'
  );
  assert.notEqual(f.evaluate().status, 'pass');
});
test('fixed proof cannot acquire an unrelated consumer dependency', () => {
  const f = proofSetup();
  writeFixture(
    f.root,
    TEST,
    'import {predicate} from "../../../apps/web/src/consumer-predicate"; export const value=predicate;'
  );
  const b = fs.readFileSync(path.join(f.root, TEST));
  f.policy.runtimeFiles[TEST] = { sha256: digest(b), bytes: b.length, mode: '100644' };
  assert.throws(() => f.evaluate(), /producer harness dependency leaves fixed closure/);
});
test('a receipt-taking or skipped-runtime mode cannot grant this boundary', () => {
  for (const field of ['acceptedReceiptInputs', 'requiredTests']) {
    const f = proofSetup();
    f.policy.runtimeEnforcement[field] = field === 'acceptedReceiptInputs' ? true : 8;
    assert.throws(() => f.evaluate(), /invalid fixed producer harness contract/);
  }
});
test('independent unsafe consumer changes remain failures beside the fixed proof', () => {
  const f = proofSetup();
  writeFixture(f.root, PREDICATE, 'export const predicate=false;');
  const r = f.evaluate();
  assert.notEqual(r.status, 'pass');
  assert.ok(r.failingNewEntries.some(row => row.file === OLD));
});
