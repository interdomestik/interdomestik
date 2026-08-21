import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { join } from 'node:path';
const BLOCKED = { runtimeAuthorized: false, activeSlice: null, successorsBlocked: true };
// prettier-ignore
const STATES = new Set('prepared,installing,installed_consumed,merged_consumed,failed_consumed,rolled_back_consumed,incident'.split(','));
// prettier-ignore
const fail = message => { throw new Error(message); };
const blocked = reason => ({ ...BLOCKED, reason });
const sha = value => createHash('sha256').update(value).digest('hex');
const isSymlink = path => fs.lstatSync(path).isSymbolicLink();
// prettier-ignore
function identity(path) { const bytes = fs.readFileSync(path); return { utf8Bytes: bytes.length, sha256: sha(bytes) }; }
function parseArgs(values) {
  const [mode, ...rest] = values,
    result = { mode };
  // prettier-ignore
  for (let index = 0; index < rest.length; index += 2) result[rest[index].slice(2)] = rest[index + 1];
  return result;
}
function receiptFor(gatePath, envelopePath, statement, locator) {
  const envelope = JSON.parse(fs.readFileSync(envelopePath));
  const gate = envelope.approvalEnvelope.gate;
  const { id, canonicalPath } = envelope.approvalEnvelope.envelope;
  const envelopeId = { id, canonicalPath, ...identity(envelopePath) };
  const actual = identity(gatePath);
  if (actual.utf8Bytes !== gate.utf8Bytes || actual.sha256 !== gate.sha256) fail('gate mismatch');
  const expected =
    `Miratoj \`${gate.id}\`, ${gate.utf8Bytes.toLocaleString('en-US')} UTF-8 bytes, ` +
    `SHA-256 \`${gate.sha256}\`, dhe \`${envelopeId.id}\`, ` +
    `${envelopeId.utf8Bytes.toLocaleString('en-US')} UTF-8 bytes, SHA-256 ` +
    `\`${envelopeId.sha256}\`, bound to \`main@${envelope.baseSha}\`; autorizoj ` +
    'materializimin, implementation review, PR, merge dhe closeout sipas envelope-it ekzakt.';
  if (statement !== expected) fail('approval statement identity mismatch');
  if (!/^[a-z0-9][a-z0-9:./#_-]+$/.test(locator)) fail('event locator is not canonical');
  const children = [envelope.approvalEnvelope.phaseA, ...envelope.approvalEnvelope.children];
  // prettier-ignore
  return {
    schemaVersion: 1, kind: 'one-approval-bootstrap-receipt', receiptId: 'IDA-WF01-ONE-APPROVAL-DELIVERY-APPROVAL-RECEIPT-R1', eventLocator: locator,
    approvalStatement: statement, gate, envelope: envelopeId, base: envelope.approvalEnvelope.gitBinding,
    outcome: envelope.productOutcomes[0], childOrder: children.map(child => child.childId), proofSurfaceIds: envelope.proofSurfaces.map(surface => surface.id),
    writerMapDigests: children.map(child => ({ childId: child.childId, sha256: sha(JSON.stringify(child.writerPaths)) })), runtimeAuthorized: false, activeSlice: null, isIndependentAuthority: false, secondApprovalRequired: false,
  };
}
// prettier-ignore
function syncDirectory(path) { const descriptor = fs.openSync(path, 'r'); fs.fsyncSync(descriptor); fs.closeSync(descriptor); }
// prettier-ignore
const writeExclusive = (path, body) => fs.writeFileSync(path, body, { flag: 'wx', mode: 0o600, flush: true });
// prettier-ignore
function sameOrWrite(path, body) { if (fs.existsSync(path) && (isSymlink(path) || fs.readFileSync(path, 'utf8') !== body)) fail('partial operation mismatch'); if (!fs.existsSync(path)) writeExclusive(path, body); }
export function installLedger(root, state) {
  if (state.status !== 'merged_consumed' || state.activeSlice !== 'B1-cd-guard')
    fail('invalid state');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (isSymlink(root)) fail('unsafe authority path');
  fs.mkdirSync(join(root, 'receipts'), { recursive: true, mode: 0o700 });
  if (isSymlink(join(root, 'receipts'))) fail('unsafe authority path');
  // prettier-ignore
  const statePath = join(root, 'authority-v1.json'), lock = `${statePath}.lock`, operationSha256 = sha(JSON.stringify(state));
  // prettier-ignore
  const record = { ...state, operationSha256 }, body = `${JSON.stringify(record, null, 2)}\n`, recovering = fs.existsSync(lock);
  if (fs.existsSync(statePath) && isSymlink(statePath)) fail('unsafe authority path');
  if (recovering && isSymlink(lock)) fail('unsafe authority path');
  if (fs.existsSync(statePath) && !recovering) fail('authority already initialized');
  // prettier-ignore
  if (recovering && fs.readFileSync(lock, 'utf8').trim() !== operationSha256) fail('recovery operation mismatch');
  if (!recovering) writeExclusive(lock, `${operationSha256}\n`);
  const recovery = `${statePath}.recovery`;
  if (recovering) sameOrWrite(recovery, `${operationSha256}\n`);
  sameOrWrite(join(root, 'receipts', `${operationSha256}.json`), body);
  syncDirectory(join(root, 'receipts'));
  const temporary = `${statePath}.tmp-${operationSha256}`;
  // prettier-ignore
  if (fs.existsSync(statePath)) { if (fs.existsSync(temporary) || fs.readFileSync(statePath, 'utf8') !== body) fail('recovery state mismatch'); }
  else { sameOrWrite(temporary, body); fs.renameSync(temporary, statePath); }
  syncDirectory(root);
  if (recovering) fs.unlinkSync(recovery);
  fs.unlinkSync(lock);
  syncDirectory(root);
  return record;
}
export function resolveLedger(root) {
  if (!fs.existsSync(root)) return blocked('missing_state');
  if (isSymlink(root) || !fs.lstatSync(root).isDirectory()) return blocked('invalid_state');
  if (fs.readdirSync(root).some(name => /\.(lock|recovery)|\.tmp-/.test(name)))
    return blocked('incomplete_operation');
  const statePath = join(root, 'authority-v1.json');
  if (!fs.existsSync(statePath)) return blocked('missing_state');
  try {
    if (isSymlink(statePath)) return blocked('invalid_state');
    const state = JSON.parse(fs.readFileSync(statePath));
    if (state.schemaVersion !== 1 || !STATES.has(state.status)) return blocked('invalid_state');
    if (state.status !== 'merged_consumed') return blocked(state.status);
    const valid = state.runtimeAuthorized === true && state.activeSlice === 'B1-cd-guard';
    return valid ? state : blocked('invalid_state');
  } catch {
    return blocked('invalid_state');
  }
}
function verifyReceipt(options) {
  // prettier-ignore
  const observed = JSON.parse(fs.readFileSync(options.receipt)), expected = receiptFor(options.gate, options.envelope, observed.approvalStatement, observed.eventLocator);
  if (JSON.stringify(observed) !== JSON.stringify(expected)) fail('receipt expands or drifts');
}
function git(repo, values) {
  const result = spawnSync('/usr/bin/git', ['-C', repo, ...values], { encoding: 'utf8' });
  if (result.status) fail(`git ${values.join(' ')} failed`);
  return result.stdout.trim();
}
function initialize(options) {
  verifyReceipt(options);
  const envelope = JSON.parse(fs.readFileSync(options.envelope));
  const mainSha = options['returned-main'];
  if (options['authority-root'] !== envelope.approvalEnvelope.durableAuthority.root)
    fail('authority root mismatch');
  // prettier-ignore
  if (git(options.repository, ['remote', 'get-url', 'origin']) !== envelope.approvalEnvelope.gitBinding.origin) fail('repository origin mismatch');
  if (git(options.repository, ['rev-parse', 'HEAD']) !== mainSha) fail('returned main mismatch');
  if (git(options.repository, ['rev-parse', `${mainSha}^`]) !== envelope.baseSha)
    fail('returned main parent mismatch');
  // prettier-ignore
  return installLedger(options['authority-root'], {
    schemaVersion: 1, programId: envelope.sliceId, revision: 1, status: 'merged_consumed',
    baseSha: envelope.baseSha, returnedMain: mainSha, envelopeSha256: identity(options.envelope).sha256,
    approvalReceiptSha256: identity(options.receipt).sha256, consumedChild: 'B0-authority-bootstrap', runtimeAuthorized: true,
    activeSlice: 'B1-cd-guard', successorsBlocked: false,
  });
}
function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === 'resolve')
    return console.log(JSON.stringify(resolveLedger(options['authority-root'])));
  if (options.mode === 'generate') {
    // prettier-ignore
    const value = receiptFor(options.gate, options.envelope, options['approval-statement'], options['event-locator']);
    return fs.writeFileSync(options.output, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  }
  if (options.mode === 'verify') return verifyReceipt(options);
  if (options.mode === 'initialize') return console.log(JSON.stringify(initialize(options)));
  fail('mode must be generate, verify, initialize, or resolve');
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
