import { request as playwrightRequest, type Page, type TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

// The runner binds this value to the server's mode; these tests never change that mode.
// Build selection and startup mismatch rejection require separate production launch probes.
const nonceMode = process.env.CSP_NONCE_MODE ?? 'off';
if (nonceMode !== 'off' && nonceMode !== 'report') {
  throw new Error('Rendering gate requires CSP_NONCE_MODE=off or report.');
}

test.describe('Hydrated business form validation', () => {
  test.use({ javaScriptEnabled: true, storageState: { cookies: [], origins: [] } });
  test('renders validation after submission without duplicating the form', async ({
    page,
  }, testInfo) => {
    await gotoApp(page, `/${routes.getLocale(testInfo)}/business-membership`, testInfo, {
      marker: 'business-membership-page-ready',
    });
    const form = page.getByTestId('business-lead-form').locator('form');
    await expect(form).toHaveCount(1);
    await expect(form.locator('input[name="_idempotencyKey"]')).toHaveValue(/\S+/);
    await expect(form.locator('button[type="submit"]')).toBeEnabled();
    // Empty input exercises validation without creating a business lead.
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#business-lead-firstName-error')).toBeVisible();
    await expect(form.locator('[aria-invalid="true"]')).toHaveCount(6);
    await expect(form).toHaveCount(1);
  });
});

async function inspectDocument(page: Page, path: string, marker: string, testInfo: TestInfo) {
  const response = await gotoApp(page, path, testInfo, { marker, markerTimeoutMs: 30_000 });
  expect(response?.ok(), 'document response must succeed').toBe(true);
  const headers = response!.headers();
  const enforced = headers['content-security-policy'];
  expect(enforced).toContain("default-src 'self'");
  expect(enforced).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  await expect(page.locator('html')).toHaveAttribute('lang', routes.getLocale(testInfo));
  await expect(page.getByTestId('page-ready').first()).toBeAttached();

  const nonce = headers['x-nonce'];
  const reportOnly = headers['content-security-policy-report-only'];
  const probe = page.locator('script[data-csp-nonce-probe]');
  if (nonceMode === 'off') {
    expect(nonce).toBeUndefined();
    expect(reportOnly).toBeUndefined();
    await expect(probe).toHaveCount(0);
    return undefined;
  }

  expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(reportOnly).toBeDefined();
  const scriptDirective = reportOnly
    .split(';')
    .find(value => value.trim().startsWith('script-src '));
  expect(scriptDirective?.match(/'nonce-([^']+)'/)?.[1]).toBe(nonce);
  expect(scriptDirective).toContain("'strict-dynamic'");
  expect(reportOnly).toContain('report-uri /api/csp-report');
  expect(reportOnly).toContain('report-to csp-endpoint');
  expect(JSON.parse(headers['report-to'])).toMatchObject({
    group: 'csp-endpoint',
    endpoints: [{ url: '/api/csp-report' }],
  });
  await expect(probe).toHaveCount(1);
  expect(await probe.evaluate(element => (element as HTMLScriptElement).nonce)).toBe(nonce);

  const scripts = await page.locator('script').evaluateAll((elements, expectedNonce) => {
    const executableTypes = new Set(['', 'text/javascript', 'application/javascript', 'module']);
    const owned = elements.filter(element => {
      const script = element as HTMLScriptElement;
      const executable = executableTypes.has((script.type || '').trim().toLowerCase());
      const firstParty = !script.src || new URL(script.src).origin === location.origin;
      const analytics = ['google-tag-manager-src', 'meta-pixel-src'].includes(script.id);
      return executable && (firstParty || analytics);
    }) as HTMLScriptElement[];
    const nextScripts = owned.filter(script => script.src.includes('/_next/'));
    const analyticsScripts = owned.filter(script =>
      ['google-tag-manager-src', 'meta-pixel-src'].includes(script.id)
    );
    return {
      nextScriptCount: nextScripts.length,
      nextScriptsWithNonceCount: nextScripts.filter(script => Boolean(script.nonce)).length,
      analyticsMismatchedNonceCount: analyticsScripts.filter(
        script => script.nonce !== expectedNonce
      ).length,
    };
  }, nonce);
  expect(
    scripts.nextScriptCount,
    'Next scripts must be present for the DG07 limitation detector'
  ).toBeGreaterThan(0);
  // The existing two-header Phase 0 architecture is an established Next.js limitation:
  // the unchanged enforced CSP wins over Report-Only during framework nonce extraction.
  // Keep this detector until a framework or architecture change deliberately unlocks DG07.
  expect(
    scripts.nextScriptsWithNonceCount,
    'DG07 unlock detector: review the two-header CSP architecture if Next starts adding nonces'
  ).toBe(0);
  expect(scripts.analyticsMismatchedNonceCount, 'mounted analytics scripts').toBe(0);
  return nonce;
}

async function inspectRepeatedDocument(
  page: Page,
  path: string,
  marker: string,
  testInfo: TestInfo
) {
  const first = await inspectDocument(page, path, marker, testInfo);
  // A second full navigation to the same URL detects reused static nonce-bearing HTML.
  const second = await inspectDocument(page, path, marker, testInfo);
  if (nonceMode === 'report')
    expect(second, 'fresh nonce for each document request').not.toBe(first);
}

test.describe('Rendering mode runtime contract', () => {
  test('preserves public document security in the bound mode', async ({ page }, testInfo) => {
    await inspectRepeatedDocument(page, routes.home(testInfo), 'landing-page-ready', testInfo);
  });

  test('preserves member document security in the bound mode', async ({
    authenticatedPage,
  }, testInfo) => {
    await inspectRepeatedDocument(
      authenticatedPage,
      routes.member(testInfo),
      'member-dashboard-ready',
      testInfo
    );
  });

  test('denies fixture operations without a valid secret before parsing the body', async ({}, testInfo) => {
    const tenantHeaders = Object.fromEntries(
      Object.entries(testInfo.project.use.extraHTTPHeaders ?? {}).filter(
        ([name]) => !['x-e2e-secret', 'cookie', 'authorization'].includes(name.toLowerCase())
      )
    );
    const api = await playwrightRequest.newContext({
      baseURL: testInfo.project.use.baseURL,
      extraHTTPHeaders: tenantHeaders,
      storageState: { cookies: [], origins: [] },
    });
    try {
      for (const secret of [undefined, `t117c-invalid-${randomUUID()}`]) {
        const response = await api.post('/api/e2e/branches', {
          headers: {
            'content-type': 'application/json',
            ...(secret === undefined ? {} : { 'x-e2e-secret': secret }),
          },
          // Invalid JSON cannot reach a database operation even if a guard regresses.
          data: '{',
          maxRedirects: 0,
        });
        expect(response.status(), 'missing/invalid secret must yield the existing not-found').toBe(
          404
        );
      }
    } finally {
      await api.dispose();
    }
  });
});
