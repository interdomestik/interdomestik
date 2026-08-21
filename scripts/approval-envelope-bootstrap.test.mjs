import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
// prettier-ignore
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
// prettier-ignore
import { installLedger, initialize, resolveLedger, verifyProtectedMain } from './approval-envelope-bootstrap.mjs';
const root = new URL('..', import.meta.url).pathname;
const script = join(root, 'scripts/approval-envelope-bootstrap.mjs');
const gate = join(root, 'docs/plans/2026-08-21-ida-wf-dg01-one-approval-delivery-protocol.md');
// prettier-ignore
const envelope = join(root, 'docs/plans/2026-08-21-ida-wf01-one-approval-delivery-envelope-v1.json');
// prettier-ignore
const receipt = join(root, 'docs/plans/2026-08-21-ida-wf01-one-approval-delivery-approval-receipt-r1.json');
const { approvalStatement: approval, eventLocator: locator } = JSON.parse(readFileSync(receipt));
// prettier-ignore
function run(args, expected = 0) { const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }); assert.equal(result.status, expected, result.stderr || result.stdout); return result; }
// prettier-ignore
function generate(output) { run(['generate', '--gate', gate, '--envelope', envelope, '--output', output, '--event-locator', locator, '--approval-statement', approval]); }
// prettier-ignore
function ledgerState() { return { schemaVersion: 1, programId: 'IDA-WF01-ONE-APPROVAL-DELIVERY', revision: 1, status: 'merged_consumed', baseSha: '1'.repeat(40), returnedMain: '2'.repeat(40), envelopeSha256: '3'.repeat(64), approvalReceiptSha256: '4'.repeat(64), consumedChild: 'B0-authority-bootstrap', runtimeAuthorized: true, activeSlice: 'B1-cd-guard', successorsBlocked: false }; }
test('generates deterministic, non-expanding bootstrap receipt', () => {
  // prettier-ignore
  const dir = mkdtempSync(join(tmpdir(), 'wf-bootstrap-')), first = join(dir, 'first.json'), second = join(dir, 'second.json');
  generate(first);
  generate(second);
  assert.deepEqual(readFileSync(first), readFileSync(second));
  // prettier-ignore
  const formatted = spawnSync('pnpm', ['exec', 'prettier', '--config', join(root, '.prettierrc'), '--write', first], { encoding: 'utf8' });
  assert.equal(formatted.status, 0, formatted.stderr || formatted.stdout);
  assert.deepEqual(readFileSync(first), readFileSync(receipt));
  run(['verify', '--gate', gate, '--envelope', envelope, '--receipt', first]);
  const generated = JSON.parse(readFileSync(first, 'utf8'));
  // prettier-ignore
  assert.deepEqual([generated.runtimeAuthorized, generated.activeSlice, generated.isIndependentAuthority], [false, null, false]);
  // prettier-ignore
  assert.equal(generated.childOrder.join('>'), 'B0-authority-bootstrap>B1-cd-guard>S1A-skill-authority>S1B-routing-standard>S2-mcp-identity>S3-exact-authority>S4A-terminal-delivery>S4B-reviewer-policy');
});
test('fails closed on artifact, approval, expansion, or future-merge claims', () => {
  // prettier-ignore
  const dir = mkdtempSync(join(tmpdir(), 'wf-bootstrap-negative-')), receiptPath = join(dir, 'receipt.json');
  generate(receiptPath);
  const original = JSON.parse(readFileSync(receiptPath, 'utf8'));
  // prettier-ignore
  const cases = [{ ...original, approvalStatement: `${original.approvalStatement} expanded` }, { ...original, futureMergeSha: '0'.repeat(40) }, { ...original, writerMapDigests: original.writerMapDigests.map((entry, index) => index ? entry : { ...entry, sha256: '0'.repeat(64) }) }];
  for (const [index, value] of cases.entries()) {
    const candidate = join(dir, `invalid-${index}.json`);
    writeFileSync(candidate, `${JSON.stringify(value, null, 2)}\n`);
    run(['verify', '--gate', gate, '--envelope', envelope, '--receipt', candidate], 1);
  }
  const badGate = join(dir, 'gate.md');
  writeFileSync(badGate, `${readFileSync(gate, 'utf8')}\n`);
  run(['verify', '--gate', badGate, '--envelope', envelope, '--receipt', receiptPath], 1);
  const source = JSON.parse(readFileSync(envelope));
  // prettier-ignore
  const mutations = [value => { value.approvalEnvelope.children[0].order = 2; }, value => { value.productOutcomes.push('extra'); }];
  for (const [index, mutate] of mutations.entries()) {
    const candidate = join(dir, `envelope-${index}.json`),
      value = structuredClone(source);
    mutate(value);
    writeFileSync(candidate, JSON.stringify(value));
    // prettier-ignore
    run(['generate', '--gate', gate, '--envelope', candidate, '--output', join(dir, `receipt-${index}.json`), '--event-locator', locator, '--approval-statement', approval], 1);
  }
});
test('rejects a human statement that does not bind all approved identities', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wf-bootstrap-statement-'));
  // prettier-ignore
  const result = run(['generate', '--gate', gate, '--envelope', envelope,
    '--output', join(dir, 'receipt.json'), '--event-locator', locator,
    '--approval-statement', approval.replace('42,210', '42,211')], 1);
  assert.match(result.stderr, /approval statement/i);
});
test('installs one fsync-backed consumed B0 state and activates only B1', () => {
  // prettier-ignore
  const authorityRoot = join(mkdtempSync(join(tmpdir(), 'wf-ledger-')), 'authority'), state = ledgerState(), installed = installLedger(authorityRoot, state);
  assert.equal(resolveLedger(authorityRoot).activeSlice, 'B1-cd-guard');
  assert.equal(statSync(join(authorityRoot, 'authority-v1.json')).mode & 0o777, 0o600);
  // prettier-ignore
  assert.equal(statSync(join(authorityRoot, 'receipts', `${installed.operationSha256}.json`)).mode & 0o777, 0o600);
  const lock = join(authorityRoot, 'authority-v1.json.lock');
  writeFileSync(lock, `${installed.operationSha256}\n`, { mode: 0o600 });
  assert.equal(resolveLedger(authorityRoot).reason, 'incomplete_operation');
  assert.equal(installLedger(authorityRoot, state).operationSha256, installed.operationSha256);
  assert.equal(existsSync(lock), false);
  assert.throws(() => installLedger(authorityRoot, state), /already initialized/i);
  const statePath = join(authorityRoot, 'authority-v1.json');
  const tampered = { ...JSON.parse(readFileSync(statePath, 'utf8')), baseSha: '9'.repeat(40) };
  writeFileSync(statePath, `${JSON.stringify(tampered, null, 2)}\n`, { mode: 0o600 });
  assert.equal(resolveLedger(authorityRoot).reason, 'invalid_state');
});
test('classified recovery finishes an exact temporary postimage', () => {
  const root = join(mkdtempSync(join(tmpdir(), 'wf-ledger-recovery-')), 'authority');
  // prettier-ignore
  const state = ledgerState(), installed = installLedger(root, state), statePath = join(root, 'authority-v1.json');
  renameSync(statePath, `${statePath}.tmp-${installed.operationSha256}`);
  writeFileSync(`${statePath}.lock`, `${installed.operationSha256}\n`, { mode: 0o600 });
  assert.equal(installLedger(root, state).operationSha256, installed.operationSha256);
  assert.equal(resolveLedger(root).activeSlice, 'B1-cd-guard');
});
test('resolver fails closed on missing, locked, temporary, or unknown state', () => {
  const root = join(mkdtempSync(join(tmpdir(), 'wf-ledger-negative-')), 'authority');
  // prettier-ignore
  assert.deepEqual(resolveLedger(root), { runtimeAuthorized: false, activeSlice: null, successorsBlocked: true, reason: 'missing_state' });
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'authority-v1.json.lock'), 'blocked\n', { mode: 0o600 });
  assert.equal(resolveLedger(root).reason, 'incomplete_operation');
  const other = join(mkdtempSync(join(tmpdir(), 'wf-ledger-unknown-')), 'authority');
  mkdirSync(other, { recursive: true });
  // prettier-ignore
  writeFileSync(join(other, 'authority-v1.json'), '{"schemaVersion":1,"status":"mystery"}\n', { mode: 0o600 });
  assert.equal(resolveLedger(other).reason, 'invalid_state');
  const link = join(mkdtempSync(join(tmpdir(), 'wf-ledger-link-')), 'authority');
  symlinkSync(other, link);
  assert.equal(resolveLedger(link).reason, 'invalid_state');
  assert.throws(() => installLedger(link, ledgerState()), /unsafe authority path/);
  assert.equal(existsSync(join(other, 'receipts')), false);
  const stateLinkRoot = join(mkdtempSync(join(tmpdir(), 'wf-state-link-')), 'authority');
  mkdirSync(stateLinkRoot);
  symlinkSync(join(other, 'authority-v1.json'), join(stateLinkRoot, 'authority-v1.json'));
  assert.equal(resolveLedger(stateLinkRoot).reason, 'invalid_state');
  const lockLinkRoot = join(mkdtempSync(join(tmpdir(), 'wf-lock-link-')), 'authority');
  mkdirSync(lockLinkRoot);
  symlinkSync(other, join(lockLinkRoot, 'authority-v1.json.lock'));
  assert.throws(() => installLedger(lockLinkRoot, ledgerState()), /unsafe authority path/);
});
test('protected-main verification rejects a local child while the live ref remains at base', () => {
  // prettier-ignore
  const returnedMain = '2'.repeat(40), binding = { protectedRef: 'refs/heads/main' }, staleGit = () => `7fb7180aafadf91b79ec37f5daeebaa85bc86ff2\t${binding.protectedRef}`;
  // prettier-ignore
  assert.throws(() => verifyProtectedMain('/repo', binding, returnedMain, staleGit), /protected main mismatch/i);
});
test('initialize binds origin, one parent, and live protected main before ledger install', () => {
  const main = '2'.repeat(40),
    base = '7fb7180aafadf91b79ec37f5daeebaa85bc86ff2';
  // prettier-ignore
  const options = { gate, envelope, receipt, repository: '/repo', 'returned-main': main, 'authority-root': '/Users/arbenlila/.codex/state/interdomestik/ida-wf01-one-approval-delivery' };
  // prettier-ignore
  const values = new Map([['remote get-url origin', 'https://github.com/interdomestik/interdomestik.git'], ['rev-parse HEAD', main], ['rev-list --parents -n 1 ' + main, `${main} ${base}`], ['ls-remote --refs origin refs/heads/main', `${main}\trefs/heads/main`]]);
  const runGit = (_repo, args) => values.get(args.join(' '));
  let installed;
  initialize(options, runGit, (_root, state) => (installed = state));
  assert.equal(installed.activeSlice, 'B1-cd-guard');
  const mergeParents = (_repo, args) =>
    args[0] === 'rev-list' ? `${main} ${base} ${'3'.repeat(40)}` : runGit(_repo, args);
  assert.throws(() => initialize(options, mergeParents, () => {}), /parent mismatch/i);
  assert.equal(run(['resolve', '--authority-root'], 1).stderr.includes('invalid arguments'), true);
});
