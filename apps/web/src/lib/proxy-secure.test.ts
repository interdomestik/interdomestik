import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSecurityHeaders } from './proxy-secure';

describe('proxy security headers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows the exact loopback Supabase origin during local E2E', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('INTERDOMESTIK_LOCAL_E2E', '1');
    vi.stubEnv('PLAYWRIGHT', '1');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321/path?ignored=1');

    const headers = createSecurityHeaders(new NextRequest('http://ida.127.0.0.1.nip.io:3000/sq'));

    expect(headers.responseHeaders.get('Content-Security-Policy')).toContain(
      "connect-src 'self' http://127.0.0.1:54321 https://*.supabase.co"
    );
  });

  it('does not allow loopback Supabase origins in production deployments', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');

    const headers = createSecurityHeaders(new NextRequest('https://ks.example.com/sq'));

    expect(headers.responseHeaders.get('Content-Security-Policy')).not.toContain(
      'http://127.0.0.1:54321'
    );
  });

  it('ignores malformed configured origins instead of adding CSP text', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', "http://127.0.0.1:54321 'unsafe-inline'");

    const headers = createSecurityHeaders(new NextRequest('http://localhost:3000/sq'));

    expect(headers.responseHeaders.get('Content-Security-Policy')).not.toContain(
      "54321 'unsafe-inline'"
    );
  });
});
