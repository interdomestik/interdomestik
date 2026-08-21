import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { join } from 'node:path';
// prettier-ignore
const STATES = new Set('prepared,installing,installed_consumed,merged_consumed,failed_consumed,rolled_back_consumed,incident'.split(',')), OPTIONS = { generate: 'gate,envelope,output,event-locator,approval-statement', verify: 'gate,envelope,receipt', initialize: 'gate,envelope,receipt,repository,returned-main,authority-root', resolve: 'authority-root' };
// prettier-ignore
const fail = message => { throw new Error(message); };
// prettier-ignore
const blocked = reason => ({ runtimeAuthorized: false, activeSlice: null, successorsBlocked: true, reason });
const sha = value => createHash('sha256').update(value).digest('hex');
const isSymlink = path => fs.lstatSync(path).isSymbolicLink();
// prettier-ignore
function identity(path) { const bytes = fs.readFileSync(path); return { utf8Bytes: bytes.length, sha256: sha(bytes) }; }
// prettier-ignore
function parseArgs([mode, ...rest]) { const allowed = OPTIONS[mode]?.split(','), result = { mode }; if (!allowed || rest.length !== allowed.length * 2) fail('invalid arguments'); for (let index = 0; index < rest.length; index += 2) { const key = rest[index].slice(2); if (rest[index] !== `--${key}` || !allowed.includes(key) || Object.hasOwn(result, key) || !rest[index + 1]) fail('invalid arguments'); result[key] = rest[index + 1]; } return result; }
function receiptFor(gatePath, envelopePath, statement, locator) {
  // prettier-ignore
  const envelope = JSON.parse(fs.readFileSync(envelopePath)), gate = envelope.approvalEnvelope.gate, { id, canonicalPath } = envelope.approvalEnvelope.envelope;
  const envelopeId = { id, canonicalPath, ...identity(envelopePath) };
  const actual = identity(gatePath);
  if (actual.utf8Bytes !== gate.utf8Bytes || actual.sha256 !== gate.sha256) fail('gate mismatch');
  // prettier-ignore
  const ordered = envelope.approvalEnvelope.children, children = [envelope.approvalEnvelope.phaseA, ...ordered];
  // prettier-ignore
  if (!ordered.every((child, index) => child.order === index + 1)) fail('child order mismatch'); else if (envelope.productOutcomes.length !== 1) fail('one outcome required');
  // prettier-ignore
  const expected = `Miratoj \`${gate.id}\`, ${gate.utf8Bytes.toLocaleString('en-US')} UTF-8 bytes, SHA-256 \`${gate.sha256}\`, dhe \`${envelopeId.id}\`, ` +
    `${envelopeId.utf8Bytes.toLocaleString('en-US')} UTF-8 bytes, SHA-256 \`${envelopeId.sha256}\`, bound to \`main@${envelope.baseSha}\`; autorizoj materializimin, implementation review, PR, merge dhe closeout sipas envelope-it ekzakt.`;
  // prettier-ignore
  if (statement !== expected) fail('approval statement identity mismatch'); else if (!/^[a-z0-9][a-z0-9:./#_-]+$/.test(locator)) fail('event locator is not canonical');
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
function sameOrWrite(path, body) { if (!fs.existsSync(path)) { writeExclusive(path, body); return; } if (isSymlink(path) || fs.readFileSync(path, 'utf8') !== body) { fail('partial operation mismatch'); } }
// prettier-ignore
function operationChecks(root, state, statePath, lock, operationSha256, recovering) { const unsafeLock = recovering && isSymlink(lock); return [
  [state.status !== 'merged_consumed' || state.activeSlice !== 'B1-cd-guard', 'invalid state'], [isSymlink(root) || isSymlink(join(root, 'receipts')), 'unsafe authority path'],
  [fs.existsSync(statePath) && isSymlink(statePath), 'unsafe authority path'], [unsafeLock, 'unsafe authority path'],
  [fs.existsSync(statePath) && !recovering, 'authority already initialized'], [recovering && !unsafeLock && fs.readFileSync(lock, 'utf8').trim() !== operationSha256, 'recovery operation mismatch'],
]; }
export function installLedger(root, state) {
  if (fs.existsSync(root) && isSymlink(root)) fail('unsafe authority path');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  // prettier-ignore
  if (isSymlink(root)) fail('unsafe authority path'); else if (fs.existsSync(join(root, 'receipts')) && isSymlink(join(root, 'receipts'))) fail('unsafe authority path');
  fs.mkdirSync(join(root, 'receipts'), { recursive: true, mode: 0o700 });
  // prettier-ignore
  const statePath = join(root, 'authority-v1.json'), lock = `${statePath}.lock`, operationSha256 = sha(JSON.stringify(state));
  // prettier-ignore
  const record = { ...state, operationSha256 }, body = `${JSON.stringify(record, null, 2)}\n`, recovering = fs.existsSync(lock);
  const checks = operationChecks(root, state, statePath, lock, operationSha256, recovering);
  for (const [invalid, message] of checks) if (invalid) fail(message);
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
    if (isSymlink(statePath)) fail('unsafe authority path');
    const state = JSON.parse(fs.readFileSync(statePath));
    const { operationSha256, ...payload } = state;
    const receipt = join(root, 'receipts', `${operationSha256}.json`);
    const body = `${JSON.stringify(state, null, 2)}\n`;
    // prettier-ignore
    if (sha(JSON.stringify(payload)) !== operationSha256 || isSymlink(join(root, 'receipts')) || !fs.existsSync(receipt) || isSymlink(receipt) || fs.readFileSync(receipt, 'utf8') !== body) fail('invalid state integrity');
    if (state.schemaVersion !== 1 || !STATES.has(state.status)) return blocked('invalid_state');
    if (state.status !== 'merged_consumed') return blocked(state.status);
    const valid = state.runtimeAuthorized === true && state.activeSlice === 'B1-cd-guard';
    return valid ? state : blocked('invalid_state');
  } catch {
    return blocked('invalid_state');
  }
}
// prettier-ignore
function verifyReceipt(options) { const observed = JSON.parse(fs.readFileSync(options.receipt)), expected = receiptFor(options.gate, options.envelope, observed.approvalStatement, observed.eventLocator); if (JSON.stringify(observed) !== JSON.stringify(expected)) fail('receipt expands or drifts'); }
// prettier-ignore
function git(repo, values) { const result = spawnSync('/usr/bin/git', ['-C', repo, ...values], { encoding: 'utf8' }); if (result.status) fail(`git ${values.join(' ')} failed`); return result.stdout.trim(); }
// prettier-ignore
export function verifyProtectedMain(repo, binding, mainSha, runGit = git) { const [liveSha, liveRef] = runGit(repo, ['ls-remote', '--refs', 'origin', binding.protectedRef]).split(/\s+/); if (liveSha !== mainSha || liveRef !== binding.protectedRef) fail('protected main mismatch'); }
export function initialize(options, runGit = git, install = installLedger) {
  verifyReceipt(options);
  // prettier-ignore
  const envelope = JSON.parse(fs.readFileSync(options.envelope)), approval = envelope.approvalEnvelope, mainSha = options['returned-main'], repo = options.repository, binding = approval.gitBinding;
  if (options['authority-root'] !== approval.durableAuthority.root) fail('authority root mismatch');
  if (runGit(repo, ['remote', 'get-url', 'origin']) !== binding.origin)
    fail('repository origin mismatch');
  if (runGit(repo, ['rev-parse', 'HEAD']) !== mainSha) fail('returned main mismatch');
  // prettier-ignore
  const parents = runGit(repo, ['rev-list', '--parents', '-n', '1', mainSha]).split(/\s+/);
  if (parents.length !== 2 || parents[0] !== mainSha || parents[1] !== envelope.baseSha)
    fail('returned main parent mismatch');
  verifyProtectedMain(repo, binding, mainSha, runGit);
  // prettier-ignore
  return install(options['authority-root'], {
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
