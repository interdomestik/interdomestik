import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as store from './approval-envelope-ledger-fs.mjs';
import * as ledger from './approval-envelope-ledger.mjs';
const { CHILDREN, evidenceReference, installLedger, resolveLedger, transitionLedger } = ledger;
const PROGRAM = 'IDA-WF01-ONE-APPROVAL-DELIVERY';
const PROOF_BYTES = store.body({ kind: 'b0_completion' });
const PROOF = store.sha(PROOF_BYTES);
const gitId = value => String(value).repeat(40);
const git = { kind: 'git', B: gitId(1), H: gitId(2), T: gitId(3), M: gitId(4) };
const local = { kind: 'local', postimageSha256: '7'.repeat(64) };
const root = label =>
  join(fs.realpathSync(fs.mkdtempSync(join(tmpdir(), `wf-${label}-`))), 'authority');
const expected = record => ({ revision: record.revision, operation: record.operationSha256 });
function proposal(current, status, event, childId = current.childId, boundary = current.boundary) {
  const common = { schemaVersion: 1, programId: PROGRAM, revision: current.revision + 1, boundary };
  common.previousOperationSha256 = current.operationSha256;
  const fromChild = current.childId;
  const evidence = { ...common, event, fromChild, toChild: childId, proofSha256: PROOF };
  const state = { ...current, ...common, status, childId };
  delete state.operationSha256;
  state.runtimeAuthorized = /^(active|prepared|installing)$/.test(status);
  state.successorsBlocked = /^(failed_consumed|rolled_back_consumed|incident|failed)$/.test(status);
  state.evidenceRef = evidenceReference(evidence);
  return { evidence, state };
}
function initialize(authority) {
  const seed = { operationSha256: null, revision: 0, childId: CHILDREN[0], boundary: git };
  const { state, evidence } = proposal(seed, 'active', 'health_cleanup_pass', CHILDREN[1]);
  state.envelopeSha256 = '5'.repeat(64);
  state.approvalReceiptSha256 = '6'.repeat(64);
  state.previousOperationSha256 = null;
  evidence.previousOperationSha256 = null;
  state.evidenceRef = evidenceReference(evidence);
  const path = join(authority, 'evidence', `proof-${PROOF}.json`);
  const persist = () => store.writeNew(path, PROOF_BYTES);
  return installLedger(authority, null, state, { evidence, beforePublish: persist });
}
function advance(authority, current, status, event, childId, boundary) {
  const next = proposal(current, status, event, childId, boundary);
  return transitionLedger(authority, expected(current), next.state, { evidence: next.evidence });
}
function lock(authority, current, target, token, pid = 999999) {
  const operation = store.sha(JSON.stringify(target.state));
  const expectation = current ? expected(current) : null;
  const owner = { pid, start: 'opaque:test', operation, expected: expectation, token };
  store.writeNew(join(authority, 'authority-v1.json.lock'), store.body(owner));
}
function recover(authority, current, target, recoveryToken) {
  const options = { evidence: target.evidence, recover: true, recoveryToken };
  return transitionLedger(authority, current ? expected(current) : null, target.state, options);
}
function transitionFixture(label) {
  const authority = root(label);
  const current = initialize(authority);
  return { authority, current, target: proposal(current, 'merged_consumed', 'merge_consumed') };
}
test('executes the exact declared topology and terminal failure edge', () => {
  const topology =
    'B0-authority-bootstrap,B1-cd-guard,S1A-skill-authority,S1B-routing-standard,S2-mcp-identity,S3-exact-authority,S4A-terminal-delivery,S4B-reviewer-policy';
  assert.equal(CHILDREN.join(','), topology);
  const authority = root('chain');
  let current = initialize(authority);
  const { operationSha256, childId } = current;
  const live = { operationSha256, childId, disposition: 'open' };
  assert.equal(resolveLedger(authority, live).activeSlice, current.childId);
  assert.equal(resolveLedger(authority).reason, 'invalid_state');
  assert.equal(
    resolveLedger(authority, { ...live, disposition: 'closed' }).reason,
    'invalid_state'
  );
  for (let index = 1; index < CHILDREN.length; index += 1) {
    if (['S1A-skill-authority', 'S1B-routing-standard'].includes(current.childId)) {
      current = advance(authority, current, 'prepared', 'prepared', undefined, local);
      current = advance(authority, current, 'installing', 'installing');
      current = advance(authority, current, 'installed_consumed', 'install_consumed');
    } else current = advance(authority, current, 'merged_consumed', 'merge_consumed');
    current =
      index === CHILDREN.length - 1
        ? advance(authority, current, 'closeout_required', 'health_cleanup_pass')
        : advance(authority, current, 'active', 'health_cleanup_pass', CHILDREN[index + 1]);
  }
  advance(authority, current, 'closed', 'success_closeout');
  const resolved = resolveLedger(authority);
  assert.equal(resolved.status, 'closed');
  assert.equal(resolved.activeSlice, null);
  assert.equal(resolved.runtimeAuthorized, false);
  assert.equal(resolved.successorsBlocked, false);
  const failure = root('failure');
  current = advance(failure, initialize(failure), 'failed_consumed', 'failed_consumed');
  const failed = advance(failure, current, 'failed', 'failed');
  assert.equal(resolveLedger(failure).successorsBlocked, true);
  assert.throws(() => advance(failure, failed, 'incident', 'incident'), /invalid/);
});
test('rejects schema, successor, and stale-CAS drift before acquiring a lock', () => {
  const next = proposal(initialize(root('seed')), 'merged_consumed', 'merge_consumed');
  const invalid = root('invalid');
  assert.throws(() => installLedger(invalid, null, { ...next.state, extra: true }, next));
  assert.equal(fs.existsSync(invalid), false);
  const authority = root('cas');
  const current = initialize(authority);
  assert.throws(() => advance(authority, current, 'active', 'health_cleanup_pass', CHILDREN[3]));
  advance(authority, current, 'merged_consumed', 'merge_consumed');
  assert.throws(() => transitionLedger(authority, expected(current), next.state, next));
  assert.deepEqual(store.markers(authority), []);
  const prewrite = root('prewrite');
  const active = initialize(prewrite);
  const drift = proposal(active, 'merged_consumed', 'merge_consumed');
  drift.evidence.toChild = CHILDREN[2];
  assert.throws(() => transitionLedger(prewrite, expected(active), drift.state, drift));
  assert.deepEqual(store.markers(prewrite), []);
});
test('recovery is exact, idempotent, and rejects unsafe filesystem state', () => {
  const { authority, current, target } = transitionFixture('recovery');
  const token = '8'.repeat(64);
  const resume = value => recover(authority, current, target, value);
  lock(authority, current, target, token);
  assert.throws(() => resume('0'.repeat(64)));
  const recovered = resume(token);
  lock(authority, current, target, token);
  assert.equal(resume(token).operationSha256, recovered.operationSha256);
  const seeded = root('initial-seed');
  const initial = root('initial-recovery');
  store.authorityPaths(initial, true);
  store.writeNew(join(initial, 'evidence', `proof-${PROOF}.json`), PROOF_BYTES);
  const { operationSha256, ...state } = initialize(seeded);
  const evidence = JSON.parse(store.text(join(seeded, state.evidenceRef)));
  lock(initial, null, { state }, token);
  assert.equal(recover(initial, null, { state, evidence }, token).operationSha256, operationSha256);
  const unknown = transitionFixture('unknown-owner');
  lock(unknown.authority, unknown.current, unknown.target, token, process.pid);
  assert.throws(() => recover(unknown.authority, unknown.current, unknown.target, token));
  const partial = transitionFixture('partial');
  lock(partial.authority, partial.current, partial.target, token);
  store.writeNew(join(partial.authority, partial.target.state.evidenceRef), '{}\n');
  assert.throws(() => recover(partial.authority, partial.current, partial.target, token));
  assert.equal(resolveLedger(partial.authority).reason, 'incomplete_operation');
  const corruptions = [
    (path, _record, statePath) => fs.chmodSync(statePath, 0o644),
    (path, _record, statePath) => fs.linkSync(statePath, join(path, 'second-link')),
    (_path, _record, statePath) => fs.appendFileSync(statePath, ' '),
    (path, record) => fs.appendFileSync(join(path, record.evidenceRef), ' '),
    path => fs.unlinkSync(join(path, 'evidence', `proof-${PROOF}.json`)),
  ];
  for (const [index, corrupt] of corruptions.entries()) {
    const path = root(`corrupt-${index}`),
      record = initialize(path);
    corrupt(path, record, join(path, 'authority-v1.json'));
    assert.equal(resolveLedger(path).reason, 'invalid_state');
  }
});
