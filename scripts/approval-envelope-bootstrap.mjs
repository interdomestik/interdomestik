import * as fs from 'node:fs';
import { isAbsolute, join, normalize } from 'node:path';
import * as store from './approval-envelope-ledger-fs.mjs';
import * as ledger from './approval-envelope-ledger.mjs';
const { git, hex, must, same, sha } = store;
const plan = name => join(fs.realpathSync(new URL('..', import.meta.url)), 'docs/plans', name);
const CANONICAL = {
  gate: plan('2026-08-21-ida-wf-dg01-one-approval-delivery-protocol.md'),
  envelope: plan('2026-08-21-ida-wf01-one-approval-delivery-envelope-v1.json'),
  receipt: plan('2026-08-21-ida-wf01-one-approval-delivery-approval-receipt-r1.json'),
};
const COMMANDS = {
  verify: 'gate,envelope,receipt'.split(','),
  initialize: 'repository,source-head,tested-merge,returned-main,proof,proof-sha256'.split(','),
  resolve: [],
};
const RECEIPT_SHA = 'da02f642ac98966343b4eb0494ff04961adab7067cc5203bf11168f0ac5e6250';
const ENVELOPE_BYTES = 49402;
const ENVELOPE_SHA = '8df6ad3a8087487a8c683e57bb4d5eebdbe0e72e1660e76375c4503a1e524387';
const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const identity = path => {
  const value = fs.readFileSync(path);
  return { utf8Bytes: value.length, sha256: sha(value) };
};
const installInitial = (root, state, evidence, proofBytes, proofSha256) => {
  const persist = marker => retainProof(root, marker, proofBytes, proofSha256);
  return ledger.installLedger(root, null, state, { evidence, beforePublish: persist });
};
export function retainProof(root, marker, bytes, proofSha256) {
  must(marker.lock === `${join(root, 'authority-v1.json')}.lock`);
  must(store.text(marker.lock) === store.body(marker.owner), 'authority lock lost');
  must(hex(proofSha256, 64) && sha(bytes) === proofSha256, 'completion proof mismatch');
  const { evidence } = store.authorityPaths(root, true);
  const path = join(evidence, `proof-${proofSha256}.json`);
  if (!store.exists(path)) store.writeNew(path, bytes);
  else must(store.regular(path) && store.text(path) === bytes.toString(), 'proof mismatch');
  store.flush(evidence);
}
export function receiptFor(gatePath, envelopePath, statement, locator, file = CANONICAL.receipt) {
  const source = readJson(envelopePath);
  const approval = source.approvalEnvelope;
  const receipt = readJson(file);
  must(identity(file).sha256 === RECEIPT_SHA, 'receipt identity mismatch');
  const [gate, envelope] = [gatePath, envelopePath].map(identity);
  must(gate.utf8Bytes === approval.gate.utf8Bytes && gate.sha256 === approval.gate.sha256);
  must(envelope.utf8Bytes === ENVELOPE_BYTES && envelope.sha256 === ENVELOPE_SHA);
  const { id, canonicalPath } = approval.envelope;
  const boundEnvelope = { id, canonicalPath, ...envelope };
  must(same(receipt.gate, approval.gate) && same(receipt.envelope, boundEnvelope));
  must(receipt.baseSha === source.baseSha);
  const expected = `Miratoj ${approval.gate.id}, ${gate.utf8Bytes.toLocaleString('en-US')} UTF-8 bytes, SHA-256 ${gate.sha256}, dhe ${approval.envelope.id}, ${envelope.utf8Bytes.toLocaleString('en-US')} UTF-8 bytes, SHA-256 ${envelope.sha256}, bound to main@${source.baseSha}; autorizoj materializimin, implementation review, PR, merge dhe closeout sipas envelope-it ekzakt.`;
  must(statement === expected, 'approval statement identity mismatch');
  must(/^[a-z0-9][a-z0-9:./#_-]+$/.test(locator), 'event locator is not canonical');
  must(receipt.approvalStatement === statement && receipt.eventLocator === locator);
  const denied = !receipt.isIndependentAuthority && !receipt.secondApprovalRequired;
  must(!receipt.runtimeAuthorized && receipt.activeSlice === null && denied, 'authority mismatch');
  return receipt;
}
export function verifyReceipt(input = CANONICAL, canonical = CANONICAL) {
  must(Buffer.compare(fs.readFileSync(input.receipt), fs.readFileSync(canonical.receipt)) === 0);
  const observed = readJson(input.receipt);
  const args = [observed.approvalStatement, observed.eventLocator, input.receipt];
  return receiptFor(input.gate, input.envelope, ...args);
}
export function initialize(input, runGit = git, install = installInitial, canonical = CANONICAL) {
  const receipt = verifyReceipt(canonical, canonical);
  const source = readJson(canonical.envelope);
  const approval = source.approvalEnvelope;
  const run = args => runGit(input.repository, args);
  const parents = commit => run(['rev-list', '--parents', '-n', '1', commit]).split(/\s+/);
  const files = args => run(args).split('\n').filter(Boolean).sort(store.alphabetical);
  const base = source.baseSha;
  const head = input['source-head'];
  const tested = input['tested-merge'];
  const main = input['returned-main'];
  must(fs.realpathSync(input.repository) === input.repository, 'repository path mismatch');
  must(run(['remote', 'get-url', 'origin']) === approval.gitBinding.origin, 'origin mismatch');
  must(run(['rev-parse', '--show-toplevel']) === input.repository, 'repository root mismatch');
  must(run(['rev-parse', 'HEAD']) === main && run(['status', '--porcelain=v1']) === '');
  const ref = approval.gitBinding.protectedRef;
  must(same(run(['ls-remote', '--refs', 'origin', ref]).split(/\s+/), [main, ref]));
  must(same(parents(tested), [tested, base, head]), 'tested merge parents mismatch');
  must(same(parents(main), [main, base]), 'returned main parent mismatch');
  const trees = [tested, main].map(commit => run(['rev-parse', `${commit}^{tree}`]));
  must(trees[0] === trees[1], 'tree mismatch');
  const changed = files(['diff-tree', '--no-commit-id', '--name-only', '-r', base, main]);
  must(
    same(changed, [...approval.phaseA.writerPaths].sort(store.alphabetical)),
    'writer closure mismatch'
  );
  for (const path of approval.phaseA.writerPaths) {
    must(!isAbsolute(path) && normalize(path) === path && !path.startsWith('..'), 'unsafe path');
    const local = run(['hash-object', path]);
    const entry = run(['ls-tree', main, '--', path]).split(/\s+/);
    must(entry[0] === '100644' && entry[1] === 'blob', 'merged mode mismatch');
    must(local === entry[2] && local === run(['rev-parse', `${main}:${path}`]), 'blob mismatch');
    const stat = fs.lstatSync(join(input.repository, path));
    must(stat.isFile() && stat.nlink === 1 && (stat.mode & 0o777) === 0o644, 'local mode mismatch');
  }
  const boundary = { kind: 'git', B: base, H: head, T: tested, M: main };
  const proofBytes = fs.readFileSync(input.proof);
  const proof = JSON.parse(proofBytes);
  const fields =
    'schemaVersion,kind,B,H,T,M,mainHealthChecksSha256,cdRunId,cdConclusion,cdRunnerId,cdStepCount,providerEvidenceSha256,worktreeRemoved,branchRemoved,branchHygieneSha256';
  store.exactKeys(proof, fields.split(','));
  must(proof.schemaVersion === 1 && proof.kind === 'b0_completion');
  must(same([proof.B, proof.H, proof.T, proof.M], [base, head, tested, main]));
  must([proof.mainHealthChecksSha256, proof.providerEvidenceSha256].every(v => hex(v, 64)));
  must(Number.isSafeInteger(proof.cdRunId) && proof.cdRunId > 0);
  must(proof.cdConclusion === 'cancelled' && proof.cdRunnerId === null && proof.cdStepCount === 0);
  must(proof.worktreeRemoved && proof.branchRemoved && hex(proof.branchHygieneSha256, 64));
  must(store.regular(input.proof) && fs.realpathSync(input.proof) === input.proof);
  must(proofBytes.equals(Buffer.from(store.body(proof))));
  must(sha(proofBytes) === input['proof-sha256'], 'completion proof mismatch');
  const common = { schemaVersion: 1, programId: source.sliceId, revision: 1, boundary };
  const evidence = {
    ...common,
    event: 'health_cleanup_pass',
    fromChild: 'B0-authority-bootstrap',
    toChild: 'B1-cd-guard',
    previousOperationSha256: null,
    proofSha256: input['proof-sha256'],
  };
  const state = {
    ...common,
    status: 'active',
    childId: 'B1-cd-guard',
    runtimeAuthorized: true,
    successorsBlocked: false,
    envelopeSha256: identity(canonical.envelope).sha256,
    approvalReceiptSha256: sha(store.body(receipt)),
    evidenceRef: ledger.evidenceReference(evidence),
    previousOperationSha256: null,
  };
  const authorityRoot = approval.durableAuthority.root;
  must(
    isAbsolute(authorityRoot) && normalize(authorityRoot) === authorityRoot,
    'unsafe authority root'
  );
  return install(authorityRoot, state, evidence, proofBytes, input['proof-sha256']);
}
function main() {
  const [mode, ...args] = process.argv.slice(2);
  const names = COMMANDS[mode];
  must(names && args.length === names.length * 2, 'invalid arguments');
  must(names.every((name, index) => args[index * 2] === `--${name}`));
  const input = Object.fromEntries(names.map((name, i) => [name, args[i * 2 + 1]]));
  if (mode === 'resolve') return console.log(JSON.stringify(ledger.resolveLedger()));
  if (mode === 'verify') return verifyReceipt(input);
  return console.log(JSON.stringify(initialize(input)));
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
