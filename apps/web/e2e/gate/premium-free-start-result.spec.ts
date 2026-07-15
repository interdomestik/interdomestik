import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { routes } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

async function expectNoOverflow(locator: Locator) {
  expect(await locator.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
}

async function completePropertyPack(page: Page, info: TestInfo) {
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('interdomestik_cookie_consent_v1', 'necessary');
    document.cookie = 'cookie_consent=necessary; Path=/; SameSite=Lax';
    if (typeof crypto.randomUUID === 'function') return;
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
      },
    });
  });
  const baseURL = info.project.use.baseURL;
  if (!baseURL) throw new Error(`Expected a base URL for ${info.project.name}`);
  await page.context().addCookies([
    {
      domain: new URL(baseURL.toString()).hostname,
      name: 'cookie_consent',
      path: '/',
      sameSite: 'Lax',
      value: 'necessary',
    },
  ]);
  await gotoApp(page, routes.home('en'), info, { marker: 'free-start-intake-shell' });
  const organizer = page.getByTestId('premium-free-start-organizer');
  await organizer.getByTestId('free-start-category-property').click();
  await organizer.getByRole('button', { name: 'Continue to guided intake' }).click();
  await organizer.getByLabel('What happened?').selectOption('water_damage');
  await organizer.getByLabel('When did it happen?').fill('2026-03-01');
  await organizer.getByLabel('Who are you dealing with?').fill('Building insurer');
  await organizer.getByLabel('What do you want to recover?').selectOption('repair');
  await organizer.getByLabel('Brief summary').fill('Water damaged two rooms after a storm.');
  await organizer.getByRole('button', { name: 'Review your summary' }).click();
  await organizer.getByRole('button', { name: 'Create my summary' }).click();
  await expect(page.getByTestId('claim-pack-result')).toBeVisible({ timeout: 15_000 });
  return organizer;
}

test.describe('premium Free Start result', () => {
  test('keeps the successful result trustworthy, operable, and reflowable', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      const organizer = await completePropertyPack(page, info);
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      const complete = organizer.getByTestId('free-start-complete');
      const result = complete.getByTestId('claim-pack-result');

      await expect(complete).toHaveAttribute('data-layout', 'full-width');
      await expect(
        result.getByRole('heading', { name: 'Your temporary result is ready.' })
      ).toBeVisible();
      await expect(result).toContainText('Photos of the property damage');
      await expect(result).toContainText('Nothing has been saved and no case has been opened.');
      await expect(result).not.toContainText(
        /human triage|Strong case|Photos showing the property/i
      );
      await expect(result.getByRole('button', { name: 'Copy letter' })).toBeVisible();
      await expect(result.getByRole('button', { name: 'Download letter' })).toBeVisible();
      await expectNoOverflow(page.locator('html'));
      await expectNoOverflow(result);

      for (const control of await result.getByRole('button').all()) {
        expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        expect(
          await control.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize))
        ).toBeGreaterThanOrEqual(16);
      }

      await result.getByRole('link').focus();
      await page.keyboard.press('Tab');
      await expect(result.getByRole('button', { name: 'Copy letter' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(result.getByRole('button', { name: 'Download letter' })).toBeFocused();

      await page.setViewportSize({ width: 768, height: 900 });
      await page.locator('html').evaluate(element => {
        element.style.zoom = '2';
        element.style.letterSpacing = '0.12em';
        element.style.wordSpacing = '0.16em';
        element.style.lineHeight = '1.5';
      });
      await expect(
        result.getByRole('heading', { name: 'Your temporary result is ready.' })
      ).toBeVisible();
      await expectNoOverflow(result);
    });
  });
});
