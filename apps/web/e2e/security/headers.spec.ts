import { expect, test } from '@playwright/test';

test.describe('Security Headers', () => {
  test('should have strict security headers', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.ok()).toBeTruthy();

    const headers = response?.headers();
    if (!headers) throw new Error('No headers found');

    // CSP
    const csp = headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('script-src');
    expect(csp).toContain("'nonce-"); // Ensure nonce is present

    // HSTS (Only on HTTPS or production, but proxy.ts logic might skip on localhost HTTP unless forced.
    // However, X-Frame-Options is unconditional in proxy.ts)
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

    // Check if nonce matches in the HTML (optional deep verify)
    // The proxy sets middleware request header, which RootLayout should read.
    // We can check if a script tag has a nonce attribute.
    // Note: Playwright might not easily see the nonce attribute value if it's hidden or if we just check page content.
    // But checking the header is the primary goal here.
  });
});
