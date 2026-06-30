import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ORIGINAL_MODE = process.env.CSP_NONCE_MODE;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

async function importCspNonceModule() {
  vi.resetModules();
  return import('./csp-nonce');
}

describe('csp-nonce', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mutableEnv.CSP_NONCE_MODE = ORIGINAL_MODE;
    mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it.each([
    { raw: '', expected: 'off' },
    { raw: ' report ', expected: 'off' },
    { raw: 'Report', expected: 'off' },
    { raw: 'enforce ', expected: 'off' },
    { raw: 'junk', expected: 'off' },
  ])('falls back to off with a warning for invalid non-production mode "$raw"', async row => {
    mutableEnv.NODE_ENV = 'test';
    mutableEnv.CSP_NONCE_MODE = row.raw;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const cspNonce = await importCspNonceModule();

    expect(cspNonce.CSP_NONCE_MODE).toBe(row.expected);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Falling back to "off"'));
  });

  it('throws on unknown production mode values', async () => {
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.CSP_NONCE_MODE = 'repor';

    await expect(importCspNonceModule()).rejects.toThrow('Invalid CSP_NONCE_MODE value');
  });

  it('throws on explicitly empty production mode values', async () => {
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.CSP_NONCE_MODE = '';

    await expect(importCspNonceModule()).rejects.toThrow('Invalid CSP_NONCE_MODE value');
  });

  it('does not echo invalid mode values in non-production warnings', async () => {
    mutableEnv.NODE_ENV = 'test';
    mutableEnv.CSP_NONCE_MODE = 'secret-ish-value';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await importCspNonceModule();

    expect(warnSpy).toHaveBeenCalledWith(expect.not.stringContaining('secret-ish-value'));
  });

  it('rejects enforce mode during Phase 0', async () => {
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.CSP_NONCE_MODE = 'enforce';

    await expect(importCspNonceModule()).rejects.toThrow(
      'CSP_NONCE_MODE=enforce is not supported in Phase 0'
    );
  });

  it('generates base64url 16-byte nonces', async () => {
    mutableEnv.NODE_ENV = 'test';
    delete mutableEnv.CSP_NONCE_MODE;
    const { generateCspNonce } = await importCspNonceModule();
    const nonces = Array.from({ length: 1000 }, () => generateCspNonce());

    expect(new Set(nonces).size).toBe(1000);
    expect(nonces.every(nonce => /^[A-Za-z0-9_-]{22}$/.test(nonce))).toBe(true);
  });

  it('builds the Phase 0 report-only CSP with strict-dynamic and report directives', async () => {
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.CSP_NONCE_MODE = 'report';
    const { buildReportOnlyCsp } = await importCspNonceModule();
    const request = new NextRequest('https://ks.example.test/sq');

    const csp = buildReportOnlyCsp({ nonce: 'abc123', isProductionHttps: true });

    expect(request.nextUrl.pathname).toBe('/sq');
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' https:");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain('report-uri /api/csp-report');
    expect(csp).toContain('report-to csp-endpoint');
    expect(csp).toContain('upgrade-insecure-requests');
  });
});
