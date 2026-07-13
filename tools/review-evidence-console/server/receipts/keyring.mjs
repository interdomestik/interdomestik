import { decodeBase64url, encodeBase64url } from '../auth/base64url.mjs';

const KEY_ID = /^[a-z0-9][a-z0-9_-]{2,63}$/u;

function decodeKey(value, label, min, max) {
  if (typeof value === 'string' && value.startsWith(`-----BEGIN ${label}-----`)) {
    const base64 = value
      .replace(`-----BEGIN ${label}-----`, '')
      .replace(`-----END ${label}-----`, '')
      .replace(/\s/gu, '');
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length < min || bytes.length > max) throw new TypeError('Invalid PEM key.');
    return bytes;
  }
  return decodeBase64url(value, { min, max });
}

export async function fingerprintPublicKey(spki) {
  const digest = await crypto.subtle.digest('SHA-256', spki);
  return `sha256:${encodeBase64url(new Uint8Array(digest))}`;
}

async function importPublic(value) {
  return crypto.subtle.importKey('spki', value, { name: 'Ed25519' }, false, ['verify']);
}

async function importPrivate(value) {
  return crypto.subtle.importKey('pkcs8', value, { name: 'Ed25519' }, false, ['sign']);
}

export async function createReceiptKeyring({ activeKeyId, privateKeyPkcs8, publicKeys }) {
  if (!KEY_ID.test(activeKeyId) || !Array.isArray(publicKeys) || publicKeys.length === 0) {
    throw new TypeError('Invalid receipt key configuration.');
  }
  const trusted = new Map();
  for (const entry of publicKeys) {
    if (!entry || !KEY_ID.test(entry.id) || trusted.has(entry.id)) throw new TypeError('Invalid key ID.');
    const spki = decodeKey(entry.publicKeySpki, 'PUBLIC KEY', 44, 128);
    const fingerprint = await fingerprintPublicKey(spki);
    if (entry.fingerprint !== fingerprint) throw new TypeError('Public key fingerprint mismatch.');
    trusted.set(entry.id, Object.freeze({ key: await importPublic(spki), fingerprint }));
  }
  const active = trusted.get(activeKeyId);
  if (!active) throw new TypeError('Active public key is not trusted.');
  const signer = privateKeyPkcs8
    ? await importPrivate(decodeKey(privateKeyPkcs8, 'PRIVATE KEY', 48, 128))
    : null;
  if (signer) {
    const challenge = new TextEncoder().encode('REC02-ACTIVE-KEY-MATCH');
    const signature = await crypto.subtle.sign('Ed25519', signer, challenge);
    if (!(await crypto.subtle.verify('Ed25519', active.key, signature, challenge))) {
      throw new TypeError('Active private/public key mismatch.');
    }
  }
  return Object.freeze({ activeKeyId, privateKey: signer, publicKeys: trusted });
}
