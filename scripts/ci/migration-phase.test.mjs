import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { digest, verifyDrainReceipt } from './migration-phase/proof.mjs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
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
const verify = (value, expected = binding) => {
  const raw = bytes(value);
  return verifyDrainReceipt(raw, sign(null, raw, privateKey), publicKey, expected, now);
};

test('verifies Ed25519 over the exact bytes and refuses an edit or unrelated signer', () => {
  assert.equal(verify(receipt).nonce, binding.attempt);
  const raw = bytes(receipt);
  const signed = sign(null, raw, privateKey);
  const edited = Buffer.concat([raw, Buffer.from('\n')]);
  const forged = sign(null, raw, generateKeyPairSync('ed25519').privateKey);
  for (const [document, signature] of [
    [edited, signed],
    [raw, forged],
  ])
    assert.throws(
      () => verifyDrainReceipt(document, signature, publicKey, binding, now),
      /RECEIPT_SIGNATURE_INVALID/u
    );
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
