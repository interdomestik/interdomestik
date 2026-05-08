import { expect, test } from '@playwright/test';
import { gotoApp } from '../utils/navigation';

test.describe('Security Headers', () => {
  const cspNonceMode = process.env.CSP_NONCE_MODE ?? 'off';

  async function expectSecurityHeaders(
    page: Parameters<typeof gotoApp>[0],
    path: string,
    marker: string,
    testInfo: Parameters<typeof gotoApp>[2]
  ) {
    const response = await gotoApp(page, path, testInfo, { marker });
    expect(response?.ok()).toBeTruthy();

    const headers = response?.headers();
    if (!headers) throw new Error('No headers found');

    const csp = headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('script-src');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

    if (cspNonceMode === 'report') {
      const reportOnlyCsp = headers['content-security-policy-report-only'];
      const nonce = headers['x-nonce'];
      expect(reportOnlyCsp).toBeDefined();
      expect(reportOnlyCsp).toContain("'nonce-");
      expect(reportOnlyCsp).toContain("'strict-dynamic'");
      expect(reportOnlyCsp).toContain('report-uri /api/csp-report');
      expect(reportOnlyCsp).toContain('report-to csp-endpoint');
      expect(headers['report-to']).toContain('"group":"csp-endpoint"');
      expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
      const scriptNonces = await page
        .locator('script')
        .evaluateAll(scripts =>
          scripts.map(script => (script as HTMLScriptElement).nonce).filter(Boolean)
        );
      expect(scriptNonces).toContain(nonce);
      return { headers, nonce };
    }

    expect(headers['content-security-policy-report-only']).toBeUndefined();
    expect(headers['x-nonce']).toBeUndefined();
    return { headers, nonce: undefined };
  }

  test('should have security headers on static public pages', async ({ page }, testInfo) => {
    await expectSecurityHeaders(page, '/', 'landing-page-ready', testInfo);
  });

  test('should have security headers on dynamic public pages', async ({ page }, testInfo) => {
    await expectSecurityHeaders(page, '/pricing', 'pricing-page-ready', testInfo);
  });

  test('should use fresh CSP report-only nonces when report mode is enabled', async ({
    page,
  }, testInfo) => {
    test.skip(
      cspNonceMode !== 'report',
      'CSP nonce report-mode proof runs with CSP_NONCE_MODE=report'
    );

    const first = await expectSecurityHeaders(page, '/', 'landing-page-ready', testInfo);
    const second = await expectSecurityHeaders(page, '/pricing', 'pricing-page-ready', testInfo);

    expect(first.nonce).toBeDefined();
    expect(second.nonce).toBeDefined();
    expect(first.nonce).not.toBe(second.nonce);
  });
});
