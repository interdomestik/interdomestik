import { describe, expect, it } from 'vitest';

import { isSignedSessionCookieValid } from './proxy-session-state';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

async function signToken(token: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(token));
  return `${token}.${toBase64Url(new Uint8Array(signature))}`;
}

describe('isSignedSessionCookieValid', () => {
  const secret = 'proxy-session-state-test-secret-which-is-long-enough';

  it('accepts a valid signed session cookie', async () => {
    const signed = await signToken('token-1', secret);

    await expect(isSignedSessionCookieValid(signed, secret)).resolves.toBe(true);
  });

  it('rejects tampered signatures and malformed values without throwing', async () => {
    const signed = await signToken('token-2', secret);
    const tampered = `${signed.slice(0, -1)}x`;

    await expect(isSignedSessionCookieValid(tampered, secret)).resolves.toBe(false);
    await expect(isSignedSessionCookieValid('.signature', secret)).resolves.toBe(false);
    await expect(isSignedSessionCookieValid('missing-separator', secret)).resolves.toBe(false);
  });

  it('decodes URL-encoded signed cookie values before verification', async () => {
    const signed = await signToken('token.with.dots', secret);

    await expect(isSignedSessionCookieValid(encodeURIComponent(signed), secret)).resolves.toBe(
      true
    );
  });
});
