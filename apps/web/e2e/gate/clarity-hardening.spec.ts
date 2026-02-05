import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { getLocale, gotoApp } from '../utils/navigation';

async function performAgentLogin(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo
) {
  const baseUrl = testInfo.project.use.baseURL?.toString() ?? '';
  const origin = new URL(baseUrl).origin;
  const loginURL = `${origin}/api/auth/sign-in/email`;
  const agent = E2E_USERS.KS_AGENT;

  const res = await page.request.post(loginURL, {
    data: { email: agent.email, password: E2E_PASSWORD },
    headers: {
      Origin: origin,
      Referer: `${origin}/login`,
      'x-forwarded-for': '127.0.0.1',
    },
  });

  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`API login failed for ${agent.email}: ${res.status()} ${text}`);
  }
}

test.describe('C1: Clarity Hardening - No Mixed Surfaces', () => {
  test('Agent: /agent redirects to canonical members route', async ({ page }, testInfo) => {
    await performAgentLogin(page, testInfo);

    const locale = getLocale(testInfo);
    await gotoApp(page, `/${locale}/agent`, testInfo);
    await expect(page).toHaveURL(new RegExp(`/${locale}/agent/members`));

    const indicator = page.getByTestId('portal-surface-indicator');
    await expect(indicator).toBeVisible();
    await expect(indicator).toContainText(/Surface: v3/i);

    await expect(page.getByTestId('legacy-surface-ready')).toHaveCount(0);
  });

  test('Agent: legacy route shows banner + link to v3', async ({ page }, testInfo) => {
    await performAgentLogin(page, testInfo);

    const locale = getLocale(testInfo);
    await gotoApp(page, `/${locale}/legacy/agent`, testInfo);

    const legacyReady = page.getByTestId('legacy-surface-ready');
    await expect(legacyReady).toBeVisible();

    const banner = page.getByTestId('legacy-banner');
    await expect(banner).toBeVisible();

    const link = page.getByTestId('legacy-banner-link');
    await expect(link).toHaveAttribute('href', /\/(sq\/)?agent\/members/);
  });
});
