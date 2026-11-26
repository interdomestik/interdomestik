import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { makeTestSigner } from './migration-phase-test-key.mjs';
import { reserveAttempt } from './migration-phase/attempt.mjs';
import {
  authenticateDrainReceipt,
  digest,
  verificationKey,
  verifyDrainReceipt,
} from './migration-phase/proof.mjs';

const signer = makeTestSigner();
const now = 2_000_000;
const binding = {
  environment: 'staging',
  manifestSha256: digest('exact manifest bytes'),
  attempt: 'a'.repeat(64),
};
const receipt = {
  ...binding,
  version: 1,
  deployment: {
    id: 'dpl_fixture',
    hostname: 'release-fixture.vercel.app',
    imageDigest: `sha256:${'a'.repeat(64)}`,
    buildDigest: `sha256:${'b'.repeat(64)}`,
    aliasUid: 'alias_fixture',
    aliasUpdatedAt: now - 500,
  },
  drain: {
    evidenceSha256: digest('inventory'),
    fenceId: 'fence-1',
    webEndpoints: ['old-endpoint'],
    workers: [],
    schedulers: [],
    queues: [],
    outstandingWrites: 0,
    inFlightTransactions: 0,
    preparedTransactions: 0,
  },
  observedAt: now - 100,
  expiresAt: now + 5000,
};
const bytes = value => Buffer.from(JSON.stringify(value));
const verify = (value, expected = binding) => verifyDrainReceipt(value, expected, now);

function workspace(t) {
  const dir = mkdtempSync(join(tmpdir(), 'release-phase-unit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('verifies a FIDO2 SSHSIG over the exact bytes with the pinned key and namespace', t => {
  const publicKeyPath = join(workspace(t), 'owner.pub');
  writeFileSync(publicKeyPath, signer.key);
  const publicKey = verificationKey(publicKeyPath, digest(signer.key));
  const raw = bytes(receipt);
  const signed = signer.sign(raw);
  assert.equal(verify(authenticateDrainReceipt(raw, signed, publicKey)).nonce, binding.attempt);
  const edited = Buffer.concat([raw, Buffer.from('\n')]);
  for (const [document, signature] of [
    [edited, signed],
    [raw, makeTestSigner().sign(raw)],
    [raw, signer.sign(raw, 'file')],
  ])
    assert.throws(
      () => authenticateDrainReceipt(document, signature, publicKey),
      /RECEIPT_SIGNATURE_INVALID/u
    );
  assert.throws(() => verificationKey(publicKeyPath, digest('different key')), /KEY_PIN_MISMATCH/u);
});

test('reserves each nonce once and refuses an unavailable or shared attempt store', t => {
  const dir = workspace(t);
  assert.throws(
    () => reserveAttempt(join(dir, 'missing'), binding.attempt),
    /ATTEMPT_STORE_REJECTED/u
  );
  chmodSync(dir, 0o755);
  assert.throws(() => reserveAttempt(dir, binding.attempt), /ATTEMPT_STORE_REJECTED/u);
  chmodSync(dir, 0o700);
  reserveAttempt(dir, binding.attempt);
  assert.throws(() => reserveAttempt(dir, binding.attempt), /RECEIPT_REPLAYED/u);
});

test('requires the approved environment, exact manifest and invocation nonce', () => {
  for (const [key, value] of Object.entries({
    environment: 'production',
    manifestSha256: digest('edited manifest'),
    attempt: 'c'.repeat(64),
  }))
    assert.throws(() => verify(receipt, { ...binding, [key]: value }), /RECEIPT_BINDING_MISMATCH/u);
});

test('checks the whole drain inventory, transaction counts and freshness', () => {
  for (const [key, value] of Object.entries({
    schedulers: undefined,
    workers: [{}],
    outstandingWrites: 1,
    inFlightTransactions: 1,
    preparedTransactions: 1,
  }))
    assert.throws(
      () => verify({ ...receipt, drain: { ...receipt.drain, [key]: value } }),
      /RECEIPT_DRAIN_INVALID/u
    );
  for (const dates of [
    { observedAt: now + 1 },
    { expiresAt: now },
    { expiresAt: now + 600_001 },
    { observedAt: receipt.deployment.aliasUpdatedAt - 1 },
  ])
    assert.throws(() => verify({ ...receipt, ...dates }), /RECEIPT_EXPIRED/u);
});
