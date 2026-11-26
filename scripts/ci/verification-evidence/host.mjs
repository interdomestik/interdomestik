import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTrustedBytes } from '../verify-machine-trust.mjs';
import { readBytes } from './bytes.mjs';
import { MANIFEST_SHA256 } from './manifest.mjs';
import { assertEvidence, isSha256 } from './ticket.mjs';

const SUPPORT = '/Library/Application Support/Interdomestik';
const NAMESPACE = 'interdomestik-gate-v1';
const APPROVAL_FIELDS = [
  'rulesSha256', 'm4MarkerSha256', 'm5MarkerSha256', 'm5RunnerSha256', 'manifestSha256',
  'allowedSignersSha256', 'm4ResolverSha256', 'm5WorkerSha256',
];

export const cleanHostEnv = Object.freeze({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  LANG: 'C',
  NODE_V8_COVERAGE: undefined,
});

export function protectedFile(name, digest) {
  const file = path.join(SUPPORT, name);
  const result = readTrustedBytes(file);
  assertEvidence(result.status === 'trusted' && (!digest || result.sha256 === digest), 'host-trust');
  return { ...result, file };
}

export function readApproval() {
  const { bytes, sha256 } = protectedFile('gate-evidence-approval.json');
  const config = JSON.parse(bytes);
  assertEvidence(
    config?.schema === 'interdomestik.gate-evidence-approval/1' &&
      config.approved === true && ['trial', 'gate'].includes(config.mode) &&
      APPROVAL_FIELDS.every(field => isSha256(config[field])) &&
      config.manifestSha256 === MANIFEST_SHA256 && config.m4MarkerSha256 !== config.m5MarkerSha256,
    'owner-approval'
  );
  return { ...config, sha256 };
}

export function checkJobDirectory(directory) {
  const stat = lstatSync(directory);
  assertEvidence(
    stat.isDirectory() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0 &&
      path.resolve(directory) === directory,
    'job-directory'
  );
}

export function hostCommand(file, args, options = {}) {
  return execFileSync(file, args, {
    env: cleanHostEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
    ...options,
  });
}

export function sign(payload, role) {
  // ssh-keygen reads the host key directly under the authority account.
  const key = path.join(os.userInfo().homedir, '.ssh', `interdomestik-gate-${role}`);
  return hostCommand('/usr/bin/ssh-keygen', ['-Y', 'sign', '-f', key, '-n', NAMESPACE], {
    input: payload,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export function authenticate(payload, signature, role, approved) {
  const signerFile = protectedFile('gate-evidence-allowed-signers', approved.allowedSignersSha256);
  const temp = mkdtempSync('/tmp/interdomestik-signature-');
  const file = path.join(temp, 'signature');
  try {
    writeFileSync(file, signature, { flag: 'wx', mode: 0o600 });
    hostCommand('/usr/bin/ssh-keygen', [
      '-Y', 'verify', '-f', signerFile.file, '-I', `interdomestik-gate-${role}`,
      '-n', NAMESPACE, '-s', file,
    ], { input: payload, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    throw new Error('authentication');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export function signedDocument(directory, name, role, approved, verify = authenticate) {
  const bytes = readBytes(path.join(directory, `${name}.json`), 1024 * 1024);
  const signature = readBytes(path.join(directory, `${name}.sig`), 16 * 1024);
  verify(bytes, signature, role, approved);
  return { value: JSON.parse(bytes), bytes, signature };
}

export function writeArtifact(directory, name, bytes) {
  writeFileSync(path.join(directory, name), bytes, { flag: 'wx', mode: 0o600 });
}
