import { E2E_USERS } from '@interdomestik/database';
import { expect, type Browser, type Page, type TestInfo } from '@playwright/test';

export function account(testInfo: TestInfo, admin = false) {
  const mk = testInfo.project.name.includes('mk');
  if (admin) return mk ? E2E_USERS.MK_ADMIN : E2E_USERS.KS_ADMIN;
  return mk ? E2E_USERS.MK_MEMBER : E2E_USERS.KS_MEMBER;
}

export async function withFreshPage(
  browser: Browser,
  info: TestInfo,
  mobile: boolean,
  run: (page: Page) => Promise<void>
) {
  const context = await browser.newContext({
    baseURL: info.project.use.baseURL,
    extraHTTPHeaders: info.project.use.extraHTTPHeaders,
    storageState: { cookies: [], origins: [] },
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 3 : 1,
  });
  try {
    await run(await context.newPage());
  } finally {
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
  }
}

/** Wait for the existing authoritative verifier, including its unchanged session cache. */
export async function awaitMemberSessionState(page: Page, info: TestInfo, present: boolean) {
  const origin = new URL(String(info.project.use.baseURL)).origin;
  expect(new URL(page.url()).origin).toBe(origin);
  const endpoint = new URL('/api/auth/login-session', origin).href;
  await expect
    .poll(
      async () => {
        const response = await page.request.get(endpoint, { timeout: 2500 });
        try {
          if (response.status() !== 200) return false;
          const bytes = await response.body();
          if (bytes.length > 4096) return false;
          const payload: unknown = JSON.parse(bytes.toString('utf8'));
          if (typeof payload !== 'object' || payload === null) return false;
          const verdict = payload as { role?: unknown; hasAdminAccess?: unknown };
          return (
            verdict.hasAdminAccess === false &&
            (present ? verdict.role === 'member' : verdict.role === undefined)
          );
        } finally {
          await response.dispose();
        }
      },
      {
        timeout: 10_000,
        intervals: [250, 500, 1000],
        message: 'authoritative member session state',
      }
    )
    .toBe(true);
}

export async function interactiveLogin(page: Page, locale: string) {
  await expect(page).toHaveURL(new RegExp(String.raw`/${locale}/login(?:\?|$)`));
  const form = page.getByTestId('login-form');
  await expect(form).toHaveCount(1);
  await expect(form.getByTestId('login-email')).toBeEditable();
  const password = form.getByTestId('login-password');
  await expect(password).toBeEditable();
  const toggle = password.locator('..').getByRole('button');
  await expect(toggle).toHaveCount(1);
  // SSR-visible controls are not handler readiness. This is setup, not a latency sample.
  await expect(async () => {
    if ((await password.getAttribute('type')) === 'password') await toggle.click();
    await expect(password).toHaveAttribute('type', 'text', { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await toggle.click();
  await expect(password).toHaveAttribute('type', 'password');
}

export async function normalLogout(page: Page, locale: string) {
  let footer = page.locator(
    '[data-sidebar="sidebar"] [data-sidebar="footer"] button[data-sidebar="menu-button"]:visible'
  );
  if ((await footer.count()) === 0) {
    await page.locator('[data-sidebar="trigger"]:visible').click();
    const drawer = page.locator('[data-sidebar="sidebar"][data-mobile="true"][data-state="open"]');
    await expect(drawer).toHaveCount(1);
    await expect
      .poll(() => drawer.evaluate(el => el.getAnimations().every(a => a.playState === 'finished')))
      .toBe(true);
    footer = drawer.locator('[data-sidebar="footer"] button[data-sidebar="menu-button"]:visible');
  }
  await expect(footer).toHaveCount(1);
  await footer.click();
  const menu = page.locator('[role="menu"]:visible');
  await expect(menu).toHaveCount(1);
  // The owned account menu's final direct action is localized Logout, as in the existing gate.
  await menu.getByRole('menuitem').last().click();
  await interactiveLogin(page, locale);
  await page.goto(`/${locale}/member`);
  await interactiveLogin(page, locale);
}
