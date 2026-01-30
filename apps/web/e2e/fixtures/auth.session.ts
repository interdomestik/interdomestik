import { Page } from '@playwright/test';
import { routes } from '../routes';
import { getAuthOrigin } from './auth.project';

// Locators that only appear when logged in
export const AUTH_OK_SELECTORS = [
  '[data-testid="user-nav"]',
  '[data-testid="sidebar-user-menu-button"]',
];

export async function hasSessionCookie(page: Page): Promise<boolean> {
  const cookies = await page.context().cookies();
  return cookies.some(c => /session|auth|better-auth/i.test(c.name));
}

/**
 * Check if user is logged in by looking for auth indicators.
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  for (const selector of AUTH_OK_SELECTORS) {
    const isVisible = await page
      .locator(selector)
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (isVisible) return true;
  }
  return await hasSessionCookie(page);
}

export async function logout(page: Page): Promise<void> {
  const current = page.url() && page.url() !== 'about:blank' ? page.url() : null;
  const origin = current ? new URL(current).origin : getAuthOrigin();
  await page.request.post(new URL('/api/auth/sign-out', origin).toString(), {
    headers: { Origin: origin },
  });
  await page.goto(routes.login('en'));
}
