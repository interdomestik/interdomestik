import { expect, test } from '@playwright/test';
import { gotoApp } from '../utils/navigation';

test.describe('Security Headers', () => {
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
  }

  test('should have security headers on static public pages', async ({ page }, testInfo) => {
    await expectSecurityHeaders(page, '/', 'landing-page-ready', testInfo);
  });

  test('should have security headers on dynamic public pages', async ({ page }, testInfo) => {
    await expectSecurityHeaders(page, '/pricing', 'pricing-page-ready', testInfo);
  });
});
