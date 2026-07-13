import { canonicalReceiptBytes } from '../state/signed-receipt-canonical.mjs';
import { verifyReceipt } from '../state/receipt-builder.mjs';

const ATTESTATION_KEYS = ['algorithm', 'keyFingerprint', 'keyId', 'signature', 'version'];
const KEY_ENTRY_KEYS = ['fingerprint', 'id', 'publicKeySpki'];
const KEY_ID = /^[a-z0-9][a-z0-9_-]{2,63}$/u;
const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const invalid = code => ({ ok: false, code });

function decodeBase64url(value, min, max) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError();
  const padded = value
    .replace(/-/gu, '+')
    .replace(/_/gu, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const canonical = btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
  if (bytes.length < min || bytes.length > max || canonical !== value) throw new TypeError();
  return bytes;
}

async function fingerprint(spki) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', spki));
  return `sha256:${btoa(String.fromCharCode(...digest))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '')}`;
}

async function normalizeTrustedKeys(bundle) {
  if (bundle?.version !== 1 || bundle.algorithm !== 'Ed25519' || !Array.isArray(bundle.keys)) {
    throw new TypeError();
  }
  const trusted = new Map();
  for (const entry of bundle.keys) {
    if (!entry || Object.keys(entry).sort(compare).join(',') !== KEY_ENTRY_KEYS.join(','))
      throw new TypeError();
    if (!KEY_ID.test(entry.id) || trusted.has(entry.id)) throw new TypeError();
    const spki = decodeBase64url(entry.publicKeySpki, 44, 128);
    if (entry.fingerprint !== (await fingerprint(spki))) throw new TypeError();
    const key = await crypto.subtle.importKey('spki', spki, { name: 'Ed25519' }, false, ['verify']);
    trusted.set(entry.id, Object.freeze({ key, fingerprint: entry.fingerprint }));
  }
  if (trusted.size === 0) throw new TypeError();
  return trusted;
}

export function createSignedReceiptVerifier(loadKeys) {
  let pendingKeys;
  async function trustedKeys() {
    if (!pendingKeys) pendingKeys = Promise.resolve().then(loadKeys).then(normalizeTrustedKeys);
    try {
      return await pendingKeys;
    } catch (error) {
      pendingKeys = undefined;
      throw error;
    }
  }
  return async function verifySignedReceipt(receipt) {
    try {
      if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt))
        return invalid('invalid_signature');
      const { attestation, ...payload } = receipt;
      if (
        !attestation ||
        Object.keys(attestation).sort(compare).join(',') !== ATTESTATION_KEYS.join(',')
      )
        return invalid('invalid_signature');
      if (attestation.version !== 1 || attestation.algorithm !== 'Ed25519')
        return invalid('invalid_signature');
      const trusted = (await trustedKeys()).get(attestation.keyId);
      if (!trusted || trusted.fingerprint !== attestation.keyFingerprint)
        return invalid('invalid_signature');
      const signature = decodeBase64url(attestation.signature, 64, 64);
      const valid = await crypto.subtle.verify(
        'Ed25519',
        trusted.key,
        signature,
        canonicalReceiptBytes(payload)
      );
      if (!valid) return invalid('invalid_signature');
      const content = await verifyReceipt(payload);
      return content.ok ? { ok: true, value: receipt } : content;
    } catch {
      return invalid('unavailable');
    }
  };
}
