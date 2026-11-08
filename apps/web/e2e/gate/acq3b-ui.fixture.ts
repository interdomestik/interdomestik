import { E2E_PASSWORD } from '@interdomestik/database';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { path as routePath } from '../fixtures/routes';
import { gotoApp } from '../utils/navigation';
import { interactiveLogin } from './test/login-handoff-page';
import type { Person } from './acq3b-context.fixture';

export const locales = ['sq', 'en', 'mk', 'sr'] as const;
export type Locale = (typeof locales)[number];

export function copy(
  locale: Locale,
  catalog: string,
  key: string,
  values: Record<string, string | number> = {}
): string {
  let value: unknown = JSON.parse(
    readFileSync(join(__dirname, '../../src/messages', locale, `${catalog}.json`), 'utf8')
  );
  for (const part of `${catalog}.${key}`.split('.')) {
    if (typeof value !== 'object' || value === null || !(part in value))
      throw new Error(`Missing ${catalog}.${key}`);
    value = (value as Record<string, unknown>)[part];
  }
  if (typeof value !== 'string') throw new Error(`Not a string: ${catalog}.${key}`);
  return value.replace(/\{(\w+)\}/gu, (match, name: string) => String(values[name] ?? match));
}

export async function dismissCookies(page: Page): Promise<void> {
  const banner = page.getByTestId('cookie-consent-banner');
  if (await banner.isVisible()) {
    await page.getByTestId('cookie-consent-decline').click();
    await expect(banner).toHaveCount(0);
  }
}

export async function loginPerson(
  page: Page,
  info: TestInfo,
  person: Person,
  locale: Locale
): Promise<void> {
  await gotoApp(page, routePath(info, `/${locale}/login`), info, { marker: 'login-form' });
  await dismissCookies(page);
  await interactiveLogin(page, locale);
  await page.getByTestId('login-email').fill(person.email);
  await page.getByTestId('login-password').fill(E2E_PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(url => !url.pathname.includes('/login'));
}

// Every action is reached by Tab, not focus() or a mouse click. Check rendered focus treatment.
export async function tabTo(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  await expect(async () => {
    if (!(await target.evaluate(node => node === document.activeElement)))
      await page.keyboard.press('Tab');
    await expect(target).toBeFocused({ timeout: 50 });
  }).toPass({ timeout: 12_000, intervals: [0] });
  expect(
    await target.evaluate(node => {
      const style = getComputedStyle(node);
      return (
        node.matches(':focus-visible') &&
        ((style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== 'none')
      );
    }),
    'primary action has a visible keyboard focus indicator'
  ).toBe(true);
}

export function actionForm(page: Page, locale: Locale, operation: string): Locator {
  // These forms currently expose accessible legends and names but no action test IDs.
  return page.locator('form').filter({
    has: page.getByRole('button', {
      name: copy(locale, 'sponsors', `actions.${operation}`),
      exact: true,
    }),
  });
}

export function rosterRow(page: Page, email: string): Locator {
  // Streaming can leave a hidden copy of the page; only the rendered row counts.
  return page.locator('li').filter({ visible: true, has: page.getByText(email, { exact: true }) });
}
