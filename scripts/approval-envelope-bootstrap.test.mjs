import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import * as bootstrap from './approval-envelope-bootstrap.mjs';
import { body, claim, sha } from './approval-envelope-ledger-fs.mjs';
const fixtureRoot = process.env.WF_APPROVAL_CANDIDATE_DIR;
const repositoryRoot = fs.realpathSync(new URL('..', import.meta.url));
const directory = fixtureRoot || join(repositoryRoot, 'docs/plans');
const names = (
  fixtureRoot
    ? 'gate-modularity-repair.md,envelope-modularity-repair.json,receipt-modularity-repair.json'
    : '2026-08-21-ida-wf-dg01-one-approval-delivery-protocol.md,2026-08-21-ida-wf01-one-approval-delivery-envelope-v1.json,2026-08-21-ida-wf01-one-approval-delivery-approval-receipt-r1.json'
).split(',');
const canonical = Object.fromEntries(
  'gate,envelope,receipt'.split(',').map((key, index) => [key, join(directory, names[index])])
);
const source = JSON.parse(fs.readFileSync(canonical.envelope));
const approved = JSON.parse(fs.readFileSync(canonical.receipt));
const temporary = label => fs.mkdtempSync(join(tmpdir(), `wf-bootstrap-${label}-`));
test('verifies only the exact canonical approval tuple and receipt bytes', () => {
  const approval = [approved.approvalStatement, approved.eventLocator, canonical.receipt];
  const observed = bootstrap.receiptFor(canonical.gate, canonical.envelope, ...approval);
  assert.deepEqual(observed, approved);
  assert.deepEqual(bootstrap.verifyReceipt(canonical, canonical), approved);
  const directory = temporary('drift');
  const badGate = join(directory, 'gate.md');
  const badReceipt = join(directory, 'receipt.json');
  fs.writeFileSync(badGate, `${fs.readFileSync(canonical.gate, 'utf8')}\n`);
  fs.writeFileSync(badReceipt, `${fs.readFileSync(canonical.receipt, 'utf8')}\n`);
  assert.throws(() => bootstrap.receiptFor(badGate, canonical.envelope, '', '', canonical.receipt));
  assert.throws(() => bootstrap.verifyReceipt({ ...canonical, receipt: badReceipt }, canonical));
});
function fixture() {
  const repository = fs.realpathSync(temporary('repository'));
  const writers = [...source.approvalEnvelope.phaseA.writerPaths].sort();
  for (const path of writers) {
    fs.mkdirSync(dirname(join(repository, path)), { recursive: true });
    fs.writeFileSync(join(repository, path), `${path}\n`, { mode: 0o644 });
  }
  const ids = {
    base: source.baseSha,
    head: '1'.repeat(40),
    tested: '2'.repeat(40),
    main: '3'.repeat(40),
    tree: '4'.repeat(40),
  };
  const refKey = `ls-remote --refs origin ${source.approvalEnvelope.gitBinding.protectedRef}`;
  const values = new Map([
    ['remote get-url origin', source.approvalEnvelope.gitBinding.origin],
    ['rev-parse --show-toplevel', repository],
    ['rev-parse HEAD', ids.main],
    ['status --porcelain=v1', ''],
    [refKey, `${ids.main}\t${source.approvalEnvelope.gitBinding.protectedRef}`],
    [`rev-list --parents -n 1 ${ids.tested}`, `${ids.tested} ${ids.base} ${ids.head}`],
    [`rev-list --parents -n 1 ${ids.main}`, `${ids.main} ${ids.base}`],
    [`rev-parse ${ids.tested}^{tree}`, ids.tree],
    [`rev-parse ${ids.main}^{tree}`, ids.tree],
    [`diff-tree --no-commit-id --name-only -r ${ids.base} ${ids.main}`, writers.join('\n')],
  ]);
  for (const path of writers) {
    const blob = `5${path.length.toString(16).padStart(39, '0')}`;
    values.set(`hash-object ${path}`, blob);
    values.set(`ls-tree ${ids.main} -- ${path}`, `100644 blob ${blob}\t${path}`);
    values.set(`rev-parse ${ids.main}:${path}`, blob);
  }
  const proof = join(repository, 'b0-completion.json');
  const proofBytes = body({
    schemaVersion: 1,
    kind: 'b0_completion',
    B: ids.base,
    H: ids.head,
    T: ids.tested,
    M: ids.main,
    mainHealthChecksSha256: '6'.repeat(64),
    cdRunId: 1611,
    cdConclusion: 'cancelled',
    cdRunnerId: null,
    cdStepCount: 0,
    providerEvidenceSha256: '7'.repeat(64),
    worktreeRemoved: true,
    branchRemoved: true,
    branchHygieneSha256: '8'.repeat(64),
  });
  fs.writeFileSync(proof, proofBytes, { mode: 0o600 });
  const proofSha256 = sha(proofBytes);
  return { repository, writers, values, proof, proofSha256, refKey, ...ids };
}
function runFixture(value, mutate = () => {}) {
  mutate(value);
  const input = {
    repository: value.repository,
    'source-head': value.head,
    'tested-merge': value.tested,
    'returned-main': value.main,
    proof: value.proof,
    'proof-sha256': value.proofSha256,
  };
  let installed;
  const git = (_repository, args) => value.values.get(args.join(' '));
  const install = (root, state, evidence, proofBytes, proofSha256) =>
    (installed = { root, state, evidence, proofBytes, proofSha256 });
  bootstrap.initialize(input, git, install, canonical);
  return installed;
}
test('binds exact root, B/H/T/M, clean closure, modes, blobs, and proof before B1', () => {
  const value = fixture();
  const { root, state, evidence, proofBytes } = runFixture(value);
  assert.equal(root, source.approvalEnvelope.durableAuthority.root);
  assert.deepEqual(
    [state.boundary.B, state.boundary.H, state.boundary.T, state.boundary.M],
    [value.base, value.head, value.tested, value.main]
  );
  assert.equal(state.childId, 'B1-cd-guard');
  assert.equal(state.runtimeAuthorized, true);
  assert.equal(evidence.proofSha256, value.proofSha256);
  assert.equal(sha(proofBytes), value.proofSha256);
});
test('persists completion proof bytes under their exact content address', () => {
  const value = fixture();
  const authority = join(fs.realpathSync(temporary('proof-store')), 'authority');
  const bytes = fs.readFileSync(value.proof);
  const marker = claim(authority, value.proofSha256, null);
  bootstrap.retainProof(authority, marker, bytes, value.proofSha256);
  const path = join(authority, 'evidence', `proof-${value.proofSha256}.json`);
  assert.equal(fs.readFileSync(path).equals(bytes), true);
  const wrongBytes = Buffer.from('{}\n');
  assert.throws(() => bootstrap.retainProof(authority, marker, wrongBytes, value.proofSha256));
  const empty = join(fs.realpathSync(temporary('proof-mismatch')), 'authority');
  const mismatch = claim(empty, value.proofSha256, null);
  assert.throws(() => bootstrap.retainProof(empty, mismatch, wrongBytes, value.proofSha256));
});
test('fails closed on every Git identity, writer, blob, and local-mode mismatch', () => {
  const cases = [
    v => v.values.set('remote get-url origin', 'https://invalid.example/repo.git'),
    v => v.values.set('rev-parse HEAD', v.base),
    v => v.values.set('status --porcelain=v1', ' M changed'),
    v => v.values.set(v.refKey, `${v.base}\t${source.approvalEnvelope.gitBinding.protectedRef}`),
    v => v.values.set(`rev-list --parents -n 1 ${v.tested}`, `${v.tested} ${v.head} ${v.base}`),
    v => v.values.set(`rev-list --parents -n 1 ${v.main}`, `${v.main} ${v.base} ${v.head}`),
    v => v.values.set(`rev-parse ${v.main}^{tree}`, '9'.repeat(40)),
    v => v.values.set(`diff-tree --no-commit-id --name-only -r ${v.base} ${v.main}`, ''),
    v =>
      v.values.set(
        `ls-tree ${v.main} -- ${v.writers[0]}`,
        v.values.get(`ls-tree ${v.main} -- ${v.writers[0]}`).replace('100644', '100755')
      ),
    v => v.values.set(`rev-parse ${v.main}:${v.writers[0]}`, '5'.repeat(40)),
    v => fs.chmodSync(join(v.repository, v.writers[0]), 0o600),
    v => fs.appendFileSync(v.proof, ' '),
  ];
  for (const mutate of cases) assert.throws(() => runFixture(fixture(), mutate));
});
