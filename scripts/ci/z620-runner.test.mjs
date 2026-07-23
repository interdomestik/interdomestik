import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  acquireLaneLock,
  captureCommand,
  checksumEvidence,
  materializeClone,
  redact,
  safeId,
  validateParity,
  writeJson,
} from './z620-runner-lib.mjs';

const root = path.resolve(import.meta.dirname, '../..');

test('parity inventory exactly covers configured workflow jobs', () => {
  const parity = JSON.parse(
    fs.readFileSync(path.join(root, 'scripts/ci/z620-parity.json'), 'utf8')
  );
  assert.deepEqual(validateParity(root, parity), []);
});

test('parity fails closed when a configured job is missing', () => {
  const parity = JSON.parse(
    fs.readFileSync(path.join(root, 'scripts/ci/z620-parity.json'), 'utf8')
  );
  delete parity.workflows['.github/workflows/ci.yml'].static;
  assert.match(validateParity(root, parity).join('\n'), /actual=.*static.*expected=/);
});

test('redaction removes provider secrets and database passwords', () => {
  const output = redact('token=alpha postgresql://postgres:postgres@127.0.0.1/db', {
    SONAR_TOKEN: 'alpha',
  });
  assert.equal(output.includes('alpha'), false);
  assert.equal(output.includes(':postgres@'), false);
  assert.match(output, /\[REDACTED\]/);
});

test('captured command output is redacted without shell evaluation', () => {
  const result = captureCommand(
    process.execPath,
    ['-e', 'process.stdout.write(process.env.SENTRY_AUTH_TOKEN)'],
    { ...process.env, SENTRY_AUTH_TOKEN: 'provider-secret' }
  );
  assert.deepEqual(result, { status: 'pass', output: '[REDACTED]' });
});

test('safe identifiers reject path traversal', () => {
  assert.equal(safeId('verify-01'), 'verify-01');
  assert.throws(() => safeId('../verify'), /Invalid identifier/);
});

test('lane lock is exclusive and recoverable', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-lock-'));
  const release = acquireLaneLock(stateRoot, 'verify');
  assert.throws(() => acquireLaneLock(stateRoot, 'verify'), /EEXIST/);
  release();
  const releaseAgain = acquireLaneLock(stateRoot, 'verify');
  releaseAgain();
});

test('materialized clone is detached, exact and clean', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-clone-'));
  const cloneDir = path.join(temporaryRoot, 'clone');
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(materializeClone(root, cloneDir, sha), sha);
  assert.equal(
    execFileSync('git', ['-C', cloneDir, 'status', '--porcelain'], { encoding: 'utf8' }).trim(),
    ''
  );
});

test('evidence checksum covers finalized JSON files', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-evidence-'));
  writeJson(path.join(runDir, 'manifest.json'), { status: 'pass' });
  const checksums = checksumEvidence(runDir, ['manifest.json']);
  assert.match(checksums['manifest.json'], /^[a-f0-9]{64}$/);
});
