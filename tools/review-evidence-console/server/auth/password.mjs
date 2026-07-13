import { timingSafeEqual } from 'node:crypto';

import { decodeCredential } from './account-schema.mjs';

const encoder = new TextEncoder();

export async function derivePasswordKey(password, salt, iterations, keyLength = 32) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    keyLength * 8
  );
  return Buffer.from(bits);
}

function normalizedUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export async function verifyPassword(
  registry,
  username,
  password,
  { deriveKey = derivePasswordKey } = {}
) {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 256) {
    return { ok: false, code: 'invalid_credentials' };
  }
  const account = registry.byUsername.get(normalizedUsername(username));
  const credential = account?.password ?? registry.dummy;
  const salt = decodeCredential(credential.salt, 16, 32, 'salt');
  const expected = decodeCredential(credential.hash, 32, 32, 'hash');
  const derived = Buffer.from(
    await deriveKey(password, salt, credential.iterations, expected.length)
  );
  const matches = derived.length === expected.length && timingSafeEqual(derived, expected);
  if (!matches || !account || account.disabled) return { ok: false, code: 'invalid_credentials' };
  return { ok: true, account };
}
