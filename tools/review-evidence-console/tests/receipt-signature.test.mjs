import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createReceiptKeyring,
  fingerprintPublicKey,
} from '../server/receipts/keyring.mjs';
import { signReceipt, verifySignedReceipt } from '../server/receipts/receipt-signature.mjs';

async function keyMaterial(id) {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const privateKeyPkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const publicKeySpki = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey));
  return {
    id,
    privateKeyPkcs8: privateKeyPkcs8.toString('base64url'),
    publicKeySpki: publicKeySpki.toString('base64url'),
    fingerprint: await fingerprintPublicKey(publicKeySpki),
  };
}

const payload = Object.freeze({
  receiptId: 'rec_0123456789abcdef01234567',
  schemaVersion: 2,
  packetId: 'mob-03a-part-a',
  decisions: { 'M03A-PRIVACY-OWNER': { decision: 'approve' } },
});

test('active Ed25519 key signs and trusted public key verifies a receipt', async () => {
  const key = await keyMaterial('rec_2026_01');
  const ring = await createReceiptKeyring({
    activeKeyId: key.id,
    privateKeyPkcs8: key.privateKeyPkcs8,
    publicKeys: [key],
  });
  const receipt = await signReceipt(payload, ring);
  assert.deepEqual(Object.keys(receipt.attestation).sort(), [
    'algorithm',
    'keyFingerprint',
    'keyId',
    'signature',
    'version',
  ]);
  assert.equal((await verifySignedReceipt(receipt, ring)).ok, true);
});

test('verification rejects tamper, wrong key id, fingerprint, and signature', async () => {
  const key = await keyMaterial('rec_2026_01');
  const ring = await createReceiptKeyring({
    activeKeyId: key.id,
    privateKeyPkcs8: key.privateKeyPkcs8,
    publicKeys: [key],
  });
  const receipt = await signReceipt(payload, ring);
  const candidates = [
    { ...receipt, packetId: 'mob-03a-part-b' },
    { ...receipt, attestation: { ...receipt.attestation, keyId: 'unknown' } },
    { ...receipt, attestation: { ...receipt.attestation, keyFingerprint: 'sha256:wrong' } },
    { ...receipt, attestation: { ...receipt.attestation, signature: 'AAAA' } },
  ];
  for (const candidate of candidates) {
    assert.deepEqual(await verifySignedReceipt(candidate, ring), {
      ok: false,
      code: 'invalid_signature',
    });
  }
});

test('rotated keyring signs with the active key and retains historical verification', async () => {
  const oldKey = await keyMaterial('rec_2026_01');
  const nextKey = await keyMaterial('rec_2027_01');
  const oldRing = await createReceiptKeyring({
    activeKeyId: oldKey.id,
    privateKeyPkcs8: oldKey.privateKeyPkcs8,
    publicKeys: [oldKey],
  });
  const oldReceipt = await signReceipt(payload, oldRing);
  const rotated = await createReceiptKeyring({
    activeKeyId: nextKey.id,
    privateKeyPkcs8: nextKey.privateKeyPkcs8,
    publicKeys: [oldKey, nextKey],
  });
  const nextReceipt = await signReceipt({ ...payload, receiptId: 'rec_1123456789abcdef01234567' }, rotated);
  assert.equal(oldReceipt.attestation.keyId, oldKey.id);
  assert.equal(nextReceipt.attestation.keyId, nextKey.id);
  assert.equal((await verifySignedReceipt(oldReceipt, rotated)).ok, true);
  assert.equal((await verifySignedReceipt(nextReceipt, rotated)).ok, true);
});

test('keyring rejects private/public mismatch and duplicate key IDs', async () => {
  const first = await keyMaterial('rec_2026_01');
  const other = await keyMaterial('rec_2027_01');
  await assert.rejects(() =>
    createReceiptKeyring({
      activeKeyId: first.id,
      privateKeyPkcs8: other.privateKeyPkcs8,
      publicKeys: [first],
    })
  );
  await assert.rejects(() =>
    createReceiptKeyring({
      activeKeyId: first.id,
      privateKeyPkcs8: first.privateKeyPkcs8,
      publicKeys: [first, first],
    })
  );
});

test('keyring accepts the documented SPKI and PKCS8 PEM formats', async () => {
  const key = await keyMaterial('rec_pem_01');
  const pem = (label, value) => `-----BEGIN ${label}-----\n${Buffer.from(value, 'base64url').toString('base64')}\n-----END ${label}-----`;
  const ring = await createReceiptKeyring({
    activeKeyId: key.id,
    privateKeyPkcs8: pem('PRIVATE KEY', key.privateKeyPkcs8),
    publicKeys: [{ ...key, publicKeySpki: pem('PUBLIC KEY', key.publicKeySpki) }],
  });
  assert.equal((await verifySignedReceipt(await signReceipt(payload, ring), ring)).ok, true);
});
