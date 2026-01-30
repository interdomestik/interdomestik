import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

// Strict E2E Spec Template
//
// Rules this template enforces:
// - No raw page.goto() in strict suites; always use gotoApp(..., { marker })
// - Tenant is host-first; never pass tenantId via query string in normal flows
// - API calls are never locale-prefixed; use origin + '/api/...'
// - Critical selectors must be data-testid
// - Every navigation must wait for an explicit readiness marker (data-testid)

test.describe('Strict Spec Template', () => {
  test('example: navigate via routes + gotoApp marker', async ({ page, loginAs }, testInfo) => {
    await loginAs('member');

    // Navigate using the canonical routes helper (locale derived from testInfo.project.use.baseURL)
    await gotoApp(page, routes.memberClaims(testInfo), testInfo, { marker: 'page-ready' });

    // Assert using stable data-testid selectors only
    await expect(page.getByTestId('page-ready')).toBeVisible();
  });

  test('example: detail navigation + data-testid assertions', async ({
    page,
    loginAs,
  }, testInfo) => {
    await loginAs('admin');

    // Example: list page (marker is an API contract on the page/layout)
    await gotoApp(page, routes.adminClaims(testInfo), testInfo, { marker: 'page-ready' });

    // Prefer testids for interactions
    await expect(page.getByTestId('page-ready')).toBeVisible();

    // Optional safe stabilizer pattern (only when proven by flaky animation)
    // await expect(async () => {
    //   await page.getByTestId('some-animated-button').click();
    //   await expect(page.getByTestId('some-dialog')).toBeVisible();
    // }).toPass({ timeout: 5000 });
  });
});
