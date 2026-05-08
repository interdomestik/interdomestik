import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ORIGINAL_MODE = process.env.CSP_NONCE_MODE;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['sq', 'en', 'sr', 'mk', 'de', 'hr'],
  },
}));

vi.mock('@/lib/feature-flags', () => ({
  isStaffAuthTolerantTenant: () => false,
}));

vi.mock('@/lib/telemetry', () => ({
  emitAuthTelemetryEvent: vi.fn(),
}));

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(`https://ks.localhost:3000${pathname}`, {
    headers: {
      host: 'ks.localhost:3000',
      'x-forwarded-proto': 'https',
    },
  });
}

async function importProxy() {
  vi.resetModules();
  return import('./proxy-logic');
}

describe('proxy CSP nonce Phase 0', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mutableEnv.CSP_NONCE_MODE = ORIGINAL_MODE;
    mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('keeps off mode on the current enforced CSP only', async () => {
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.CSP_NONCE_MODE = 'off';
    const { proxy } = await importProxy();

    const response = await proxy(makeRequest('/sq'));

    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'self' 'unsafe-inline'"
    );
    expect(response.headers.get('content-security-policy-report-only')).toBeNull();
    expect(response.headers.get('report-to')).toBeNull();
    expect(response.headers.get('x-nonce')).toBeNull();
  });

  it('keeps the enforced CSP byte-identical in report mode', async () => {
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.CSP_NONCE_MODE = 'off';
    const offProxy = (await importProxy()).proxy;
    const offResponse = await offProxy(makeRequest('/sq'));
    const offCsp = offResponse.headers.get('content-security-policy');

    mutableEnv.CSP_NONCE_MODE = 'report';
    const reportProxy = (await importProxy()).proxy;
    const reportResponse = await reportProxy(makeRequest('/sq'));

    expect(reportResponse.headers.get('content-security-policy')).toBe(offCsp);
    expect(reportResponse.headers.get('content-security-policy-report-only')).toContain("'nonce-");
    expect(reportResponse.headers.get('content-security-policy-report-only')).toContain(
      "'strict-dynamic'"
    );
    expect(reportResponse.headers.get('content-security-policy-report-only')).toContain(
      'report-uri /api/csp-report'
    );
    expect(reportResponse.headers.get('content-security-policy-report-only')).toContain(
      'report-to csp-endpoint'
    );
    expect(reportResponse.headers.get('report-to')).toBe(
      '{"group":"csp-endpoint","max_age":86400,"endpoints":[{"url":"/api/csp-report"}]}'
    );
    expect(reportResponse.headers.get('x-nonce')).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('uses different nonces for consecutive report-mode requests', async () => {
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.CSP_NONCE_MODE = 'report';
    const { proxy } = await importProxy();

    const first = await proxy(makeRequest('/sq'));
    const second = await proxy(makeRequest('/sq/pricing'));

    expect(first.headers.get('x-nonce')).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(second.headers.get('x-nonce')).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(first.headers.get('x-nonce')).not.toBe(second.headers.get('x-nonce'));
  });

  it('adds report-only nonce headers to protected redirects without changing auth behavior', async () => {
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.CSP_NONCE_MODE = 'report';
    const { proxy } = await importProxy();

    const response = await proxy(makeRequest('/sq/member'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://ks.localhost:3000/sq/login');
    expect(response.headers.get('x-auth-guard')).toBe('middleware-redirect');
    expect(response.headers.get('content-security-policy-report-only')).toContain("'nonce-");
    expect(response.headers.get('x-nonce')).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});
