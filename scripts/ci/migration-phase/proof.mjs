import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const HEX = /^[a-f0-9]{64}$/u;
export const COMMIT = /^[a-f0-9]{40}$/u;
export const DIGEST = /^sha256:[a-f0-9]{64}$/u;
export const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/u;
const DEPLOY_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/u;
const DEPLOY_ID = /^dpl_[a-zA-Z0-9]{1,64}$/u;
const MAX_AGE_MS = 10 * 60_000;
const NAMESPACE = 'release-phase@interdomestik.com';
const SIGNER = 'release-owner';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const matches = (expression, value) => typeof value === 'string' && expression.test(value);
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function readBytes(file, label, limit = 16_384) {
  let raw;
  try {
    raw = readFileSync(file);
  } catch {
    throw new Error(`${label}_MISSING_OR_SIZE`);
  }
  if (raw.length === 0 || raw.length > limit) throw new Error(`${label}_MISSING_OR_SIZE`);
  return raw;
}

export function readObject(raw, label) {
  const decoded = raw.toString('utf8');
  let value;
  try {
    if (!Buffer.from(decoded).equals(raw)) throw new Error();
    value = JSON.parse(decoded);
  } catch {
    throw new Error(`${label}_JSON_INVALID`);
  }
  if (!object(value)) throw new Error(`${label}_SHAPE_INVALID`);
  return value;
}

export function verificationKey(file, expectedDigest) {
  const raw = readBytes(file, 'KEY', 4096);
  const key = /^sk-ssh-ed25519@openssh\.com ([A-Za-z0-9+/=]+)(?: [\x20-\x7e]*)?\r?\n?$/u.exec(
    raw.toString('utf8')
  );
  if (digest(raw) !== expectedDigest || !key) throw new Error('KEY_PIN_MISMATCH');
  return `sk-ssh-ed25519@openssh.com ${key[1]}`;
}

export function authenticateDrainReceipt(raw, signature, key) {
  const dir = mkdtempSync(join(tmpdir(), 'release-phase-sshsig-'));
  try {
    const signers = join(dir, 'signers');
    const sig = join(dir, 'receipt.sig');
    writeFileSync(signers, `${SIGNER} namespaces="${NAMESPACE}" ${key}\n`, { mode: 0o600 });
    writeFileSync(sig, signature, { mode: 0o600 });
    const result = spawnSync(
      '/usr/bin/ssh-keygen',
      ['-Y', 'verify', '-f', signers, '-I', SIGNER, '-n', NAMESPACE, '-s', sig],
      { input: raw, env: { LANG: 'C' }, stdio: ['pipe', 'ignore', 'ignore'], timeout: 5000 }
    );
    if (result.error) throw new Error('RECEIPT_VERIFIER_UNAVAILABLE');
    if (result.status !== 0) throw new Error('RECEIPT_SIGNATURE_INVALID');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const receipt = readObject(raw, 'RECEIPT');
  if (!matches(HEX, receipt.attempt)) throw new Error('RECEIPT_SHAPE_INVALID');
  return receipt;
}

export function verifyDrainReceipt(receipt, binding, now = Date.now()) {
  if (
    receipt.version !== 1 ||
    !matches(HEX, receipt.manifestSha256) ||
    !object(receipt.deployment) ||
    !object(receipt.drain)
  )
    throw new Error('RECEIPT_SHAPE_INVALID');
  if (
    receipt.environment !== binding.environment ||
    receipt.manifestSha256 !== binding.manifestSha256 ||
    receipt.attempt !== binding.attempt
  )
    throw new Error('RECEIPT_BINDING_MISMATCH');

  const { deployment, drain, observedAt, expiresAt } = receipt;
  if (
    !matches(DEPLOY_ID, deployment.id) ||
    !matches(DEPLOY_HOST, deployment.hostname) ||
    !matches(DIGEST, deployment.imageDigest) ||
    !matches(DIGEST, deployment.buildDigest) ||
    !matches(ID, deployment.aliasUid) ||
    !Number.isSafeInteger(deployment.aliasUpdatedAt) ||
    deployment.aliasUpdatedAt <= 0
  )
    throw new Error('RECEIPT_DEPLOYMENT_INVALID');
  if (
    !matches(HEX, drain.evidenceSha256) ||
    !matches(ID, drain.fenceId) ||
    drain.outstandingWrites !== 0 ||
    drain.inFlightTransactions !== 0 ||
    drain.preparedTransactions !== 0 ||
    !['webEndpoints', 'workers', 'schedulers', 'queues'].every(
      key => Array.isArray(drain[key]) && drain[key].every(value => matches(ID, value))
    )
  )
    throw new Error('RECEIPT_DRAIN_INVALID');

  if (
    !Number.isSafeInteger(observedAt) ||
    !Number.isSafeInteger(expiresAt) ||
    observedAt < deployment.aliasUpdatedAt ||
    observedAt > now ||
    expiresAt <= now ||
    expiresAt - observedAt > MAX_AGE_MS
  )
    throw new Error('RECEIPT_EXPIRED');
  return { nonce: receipt.attempt, expiresAt, deployment };
}
