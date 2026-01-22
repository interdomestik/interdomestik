import { Page, expect } from '@playwright/test';

type DenyMode = 'strict' | 'ui' | 'flexible';

/**
 * Asserts that the current user is denied access to the page.
 * Supports both strict middleware isolation (blank/hidden body) and 404 UI.
 */
export async function assertAccessDenied(page: Page, mode: DenyMode = 'flexible') {
  await page.waitForLoadState('domcontentloaded');

  if (mode === 'strict' || mode === 'flexible') {
    const body = page.locator('body');
    const isHidden = !(await body.isVisible());
    const innerText = await body.innerText();
    const isEmpty = innerText.trim().length === 0;

    // Strict isolation often results in an empty or hidden body
    if (isHidden || isEmpty) {
      console.log(`[RBAC] Access denied confirmed via ${isHidden ? 'hidden' : 'empty'} body.`);
      return;
    }
  }

  if (mode === 'ui' || mode === 'flexible') {
    // Check for explicit error testids first (Preferred)
    const errorPage = page.getByTestId('error-page');
    const notFoundPage = page.getByTestId('not-found-page');
    const accessDeniedPage = page.getByTestId('access-denied-page');

    if (await errorPage.or(notFoundPage).or(accessDeniedPage).isVisible()) {
      console.log('[RBAC] Access denied confirmed via error/not-found testid.');
      return;
    }

    // Fallback: Check for standard 404/403 UI indicators (Legacy)
    // Matches Albanian (sq), Macedonian (mk), and English (en)
    const heading = page.getByRole('heading', {
      name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet|Страницата не е пронајдена/i,
    });

    // If strict check didn't return, UI MUST be visible
    await expect(heading).toBeVisible({ timeout: 5000 });
    console.log('[RBAC] Access denied confirmed via 404/403 UI heading.');
  }
}
