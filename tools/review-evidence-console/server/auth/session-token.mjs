import { timingSafeEqual } from 'node:crypto';

import { decodeBase64url, encodeBase64url } from './base64url.mjs';

const encoder = new TextEncoder();
const invalid = () => ({ ok: false, code: 'invalid_session' });
const currentSeconds = () => Math.floor(Date.now() / 1000);
const compareStrings = (left, right) => left.localeCompare(right, 'en');

async function signature(value, secret) {
  const bytes = decodeBase64url(secret, { min: 32, max: 64 });
  const key = await crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return Buffer.from(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export async function createSessionToken(
  account,
  { secret, origin, now = currentSeconds, ttlSeconds = 28_800 }
) {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 28_800) {
    throw new TypeError('Invalid session TTL.');
  }
  const issuedAt = now();
  const payload = {
    v: 1,
    aid: account.id,
    fid: account.fixtureId,
    role: account.role,
    sv: account.sessionVersion,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    org: origin,
  };
  const encoded = encodeBase64url(encoder.encode(JSON.stringify(payload)));
  return `${encoded}.${encodeBase64url(await signature(encoded, secret))}`;
}

function validPayload(value) {
  const keys = ['aid', 'exp', 'fid', 'iat', 'org', 'role', 'sv', 'v'];
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort(compareStrings).join(',') === keys.join(',') &&
    value.v === 1 &&
    typeof value.aid === 'string' &&
    typeof value.fid === 'string' &&
    typeof value.role === 'string' &&
    Number.isSafeInteger(value.sv) &&
    Number.isSafeInteger(value.iat) &&
    Number.isSafeInteger(value.exp) &&
    typeof value.org === 'string'
  );
}

export async function verifySessionToken(token, registry, { secret, origin, now = currentSeconds }) {
  try {
    if (typeof token !== 'string' || token.length > 4096) return invalid();
    const parts = token.split('.');
    if (parts.length !== 2) return invalid();
    const supplied = decodeBase64url(parts[1], { min: 32, max: 32 });
    const expected = await signature(parts[0], secret);
    if (!timingSafeEqual(supplied, expected)) return invalid();
    const payload = JSON.parse(decodeBase64url(parts[0]).toString('utf8'));
    if (!validPayload(payload)) return invalid();
    const current = now();
    if (payload.iat > current || payload.exp <= current || payload.exp - payload.iat > 28_800) {
      return invalid();
    }
    const account = registry.byId.get(payload.aid);
    if (
      !account ||
      account.disabled ||
      account.sessionVersion !== payload.sv ||
      account.fixtureId !== payload.fid ||
      account.role !== payload.role ||
      payload.org !== origin
    ) {
      return invalid();
    }
    return { ok: true, account, expiresAt: payload.exp };
  } catch {
    return invalid();
  }
}

export function sessionExpiryFromToken(token) {
  const payload = JSON.parse(decodeBase64url(token.split('.')[0]).toString('utf8'));
  if (!validPayload(payload)) throw new TypeError('Invalid session token.');
  return payload.exp;
}
