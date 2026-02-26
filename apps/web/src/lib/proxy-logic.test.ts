import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['sq', 'en', 'sr', 'mk', 'de', 'hr'],
  },
}));

import { proxy } from './proxy-logic';

const ORIGINAL_SECRET = process.env.BETTER_AUTH_SECRET;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signSessionToken(token: string, secret: string): Promise<string> {
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

function makeRequest(pathname: string, cookieHeader?: string): NextRequest {
  const headers = new Headers({ host: 'ks.localhost:3000' });
  if (cookieHeader) headers.set('cookie', cookieHeader);
  return new NextRequest(`http://ks.localhost:3000${pathname}`, { headers });
}

function mockSessionLookup(payload: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  );
}

describe('proxy auth guard hardening', () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = 'proxy-guard-test-secret-which-is-long-enough-123456';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.BETTER_AUTH_SECRET = ORIGINAL_SECRET;
  });

  it('redirects protected routes when session cookie signature is invalid', async () => {
    const request = makeRequest('/sq/member', 'better-auth.session_token=tampered.invalid');

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://ks.localhost:3000/sq/login');
  });

  it('redirects when signed cookie exists but session introspection returns null', async () => {
    const signed = await signSessionToken('token-abc', process.env.BETTER_AUTH_SECRET as string);
    const fetchSpy = mockSessionLookup(null);
    const request = makeRequest('/sq/member', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://ks.localhost:3000/sq/login');
  });

  it('allows protected routes only when signed cookie and introspected session are valid', async () => {
    const signed = await signSessionToken('token-xyz', process.env.BETTER_AUTH_SECRET as string);
    const fetchSpy = mockSessionLookup({
      session: {
        id: 's1',
        token: 'token-xyz',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      user: { id: 'u1', role: 'member' },
    });
    const request = makeRequest('/sq/member', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-e2e-tenant')).toBe('tenant_ks');
  });
});
