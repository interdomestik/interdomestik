import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
const SPAWN = { encoding: 'utf8' };
export const sha = value => createHash('sha256').update(value).digest('hex');
export const body = value => `${JSON.stringify(value, null, 2)}\n`;
export const must = (value, message = 'invalid state') => {
  if (!value) throw new Error(message);
};
export const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
export const text = path => fs.readFileSync(path, 'utf8');
export const exists = fs.existsSync;
export const hex = (value, size) =>
  typeof value === 'string' && new RegExp(`^[0-9a-f]{${size}}$`).test(value);
export const alphabetical = (left, right) => left.localeCompare(right, 'en');
export const exactKeys = (value, keys) =>
  must(same(Object.keys(value).sort(alphabetical), [...keys].sort(alphabetical)), 'invalid keys');
export const markers = root =>
  fs.readdirSync(root).filter(name => /\.(lock|recovery)$|\.tmp-/.test(name));
export function flush(path) {
  const file = fs.openSync(path, 'r');
  fs.fsyncSync(file);
  fs.closeSync(file);
}
function secureNode(path, directory = false) {
  const stat = fs.lstatSync(path);
  const type = directory ? stat.isDirectory() : stat.isFile() && stat.nlink === 1;
  const real = !directory || fs.realpathSync(path) === path;
  must(type && real && (stat.mode & 0o777) === (directory ? 0o700 : 0o600), 'unsafe path');
  return true;
}
export const regular = path => secureNode(path);
function makeDirectory(path) {
  must(fs.realpathSync(dirname(path)) === dirname(path), 'unsafe authority parent');
  fs.mkdirSync(path, { mode: 0o700 });
  flush(dirname(path));
}
export function authorityPaths(root, create = false) {
  if (create && !fs.existsSync(root)) makeDirectory(root);
  secureNode(root, true);
  const receipts = join(root, 'receipts'),
    evidence = join(root, 'evidence');
  for (const path of [receipts, evidence]) {
    if (create && !fs.existsSync(path)) makeDirectory(path);
    secureNode(path, true);
  }
  return { target: join(root, 'authority-v1.json'), receipts, evidence };
}
const EXCLUSIVE =
  fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;
export const writeNew = (path, value) =>
  fs.writeFileSync(path, value, { flag: EXCLUSIVE, mode: 0o600, flush: true });
export function validBoundary(boundary, failure = false) {
  const keys = boundary.kind === 'git' ? ['kind', 'B', 'H', 'T', 'M'] : ['kind', 'postimageSha256'];
  exactKeys(boundary, keys);
  if (boundary.kind === 'git') {
    must([boundary.B, boundary.H, boundary.T].every(value => hex(value, 40)));
    must(hex(boundary.M, 40) || (failure && boundary.M === null));
    return;
  }
  must(boundary.kind === 'local');
  must(hex(boundary.postimageSha256, 64) || (failure && boundary.postimageSha256 === null));
}
export function readAuthority(root, validateState, evidenceReference, dirty = false) {
  const { target, receipts, evidence } = authorityPaths(root);
  must(dirty || markers(root).length === 0, 'incomplete_operation');
  must(fs.existsSync(target) && regular(target));
  const record = JSON.parse(text(target));
  const { operationSha256: operation, ...state } = record;
  const receipt = join(receipts, `${operation}.json`);
  must(sha(JSON.stringify(state)) === operation, 'invalid state integrity');
  must(fs.existsSync(receipt) && regular(receipt));
  must(text(receipt) === body(record), 'invalid state integrity');
  must(text(target) === text(receipt), 'invalid state integrity');
  validateState(state);
  const proofPath = join(root, state.evidenceRef);
  must(fs.existsSync(proofPath) && regular(proofPath));
  const proof = JSON.parse(text(proofPath));
  must(text(proofPath) === body(proof), 'invalid evidence integrity');
  must(evidenceReference(proof) === state.evidenceRef && proof.revision === state.revision);
  must(proof.toChild === state.childId);
  must(proof.previousOperationSha256 === state.previousOperationSha256);
  must(same(proof.boundary, state.boundary));
  const retained = fs.readdirSync(evidence).filter(name => /^proof-[0-9a-f]{64}\.json$/.test(name));
  must(retained.length === 1, 'invalid retained proof');
  const retainedPath = join(evidence, retained[0]),
    retainedBytes = text(retainedPath);
  must(regular(retainedPath) && retainedBytes === body(JSON.parse(retainedBytes)));
  must(retained[0] === `proof-${sha(retainedBytes)}.json`, 'invalid retained proof');
  return record;
}
const ps = pid => spawnSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], SPAWN);
function ownerState(owner) {
  const valid = owner && Number.isSafeInteger(owner.pid) && typeof owner.start === 'string';
  if (!valid || !hex(owner.token, 64)) return 'unknown';
  const observed = ps(owner.pid);
  const start = observed.stdout?.trim();
  if (observed.status === 0 && start) {
    if (!owner.start.startsWith('ps:')) return 'unknown';
    return owner.start === `ps:${start}` ? 'live' : 'dead';
  }
  try {
    process.kill(owner.pid, 0);
    return 'unknown';
  } catch (error) {
    return error.code === 'ESRCH' ? 'dead' : 'unknown';
  }
}
export function claim(root, operation, expected, options = {}) {
  const { target } = authorityPaths(root, expected === null);
  const lock = `${target}.lock`,
    recovery = `${target}.recovery`;
  if (!options.recover) {
    const observed = ps(process.pid);
    const seen = observed.stdout?.trim();
    const start =
      observed.status === 0 && seen ? `ps:${seen}` : `opaque:${randomBytes(32).toString('hex')}`;
    if (expected === null) must(!fs.existsSync(target), 'authority already initialized');
    must(markers(root).length === 0, 'incomplete_operation');
    const token = randomBytes(32).toString('hex');
    const owner = { pid: process.pid, start, operation, expected, token };
    writeNew(lock, body(owner));
    flush(root);
    return { lock, owner };
  }
  const temporary = `${target}.tmp-${operation}`;
  must(markers(root).every(name => [lock, temporary].includes(join(root, name))));
  must(fs.existsSync(lock) && regular(lock), 'recovery unavailable');
  const bytes = text(lock);
  const owner = JSON.parse(bytes);
  const exact = owner.operation === operation && owner.token === options.recoveryToken;
  must(exact && same(owner.expected, expected), 'recovery mismatch');
  must(ownerState(owner) === 'dead', 'owner is live or unknown');
  writeNew(recovery, body({ operation, token: owner.token }));
  flush(root);
  must(text(lock) === bytes && ownerState(owner) === 'dead', 'recovery mismatch');
  return { lock, recovery, owner };
}
export function release(root, marker) {
  if (marker.recovery) fs.unlinkSync(marker.recovery);
  fs.unlinkSync(marker.lock);
  flush(root);
}
export function releaseUnmutated(root, marker) {
  const owned = fs.existsSync(marker.lock) && text(marker.lock) === body(marker.owner);
  if (owned) release(root, marker);
}
export function git(repository, args) {
  const result = spawnSync('/usr/bin/git', ['-C', repository, ...args], SPAWN);
  must(!result.status, `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}
