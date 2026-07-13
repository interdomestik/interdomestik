import { decodeBase64url, encodeBase64url } from '../auth/base64url.mjs';
import { canonicalReceiptBytes } from './canonical-json.mjs';

const invalid = () => ({ ok: false, code: 'invalid_signature' });
const ATTESTATION_KEYS = ['algorithm', 'keyFingerprint', 'keyId', 'signature', 'version'];

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export async function signReceipt(payload, keyring) {
  if (!keyring.privateKey || Object.hasOwn(payload, 'attestation')) {
    throw new TypeError('Receipt signing key or payload is invalid.');
  }
  const trusted = keyring.publicKeys.get(keyring.activeKeyId);
  if (!trusted) throw new TypeError('Active receipt key is unavailable.');
  const signature = await crypto.subtle.sign(
    'Ed25519',
    keyring.privateKey,
    canonicalReceiptBytes(payload)
  );
  return deepFreeze({
    ...structuredClone(payload),
    attestation: {
      version: 1,
      algorithm: 'Ed25519',
      keyId: keyring.activeKeyId,
      keyFingerprint: trusted.fingerprint,
      signature: encodeBase64url(new Uint8Array(signature)),
    },
  });
}

export async function verifySignedReceipt(receipt, keyring) {
  try {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return invalid();
    const { attestation, ...payload } = receipt;
    if (
      !attestation ||
      Object.keys(attestation).sort().join(',') !== ATTESTATION_KEYS.join(',') ||
      attestation.version !== 1 ||
      attestation.algorithm !== 'Ed25519'
    ) return invalid();
    const trusted = keyring.publicKeys.get(attestation.keyId);
    if (!trusted || trusted.fingerprint !== attestation.keyFingerprint) return invalid();
    const signature = decodeBase64url(attestation.signature, { min: 64, max: 64 });
    const verified = await crypto.subtle.verify(
      'Ed25519',
      trusted.key,
      signature,
      canonicalReceiptBytes(payload)
    );
    return verified ? { ok: true, value: receipt } : invalid();
  } catch {
    return invalid();
  }
}
