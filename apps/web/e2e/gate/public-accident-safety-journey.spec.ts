import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { routes, type Locale } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

const localeMatrix = [
  { locale: 'sq', title: 'A është dikush i lënduar?', width: 320, height: 720 },
  { locale: 'en', title: 'Is anyone injured?', width: 375, height: 812 },
  { locale: 'sr', title: 'Da li je neko povređen?', width: 390, height: 844 },
  { locale: 'mk', title: 'Дали некој е повреден?', width: 768, height: 900 },
  { locale: 'sq', title: 'A është dikush i lënduar?', width: 1024, height: 768 },
  { locale: 'sq', title: 'A është dikush i lënduar?', width: 1440, height: 900 },
  { locale: 'sq', title: 'A është dikush i lënduar?', width: 844, height: 390 },
] as const;

async function openJourney(page: Page, info: TestInfo, locale: Locale = 'sq') {
  await gotoApp(page, routes.home(locale), info, { marker: 'public-entry-hero' });
  await page.waitForFunction(() => {
    const vehicle = document.querySelector('[data-testid="public-entry-vehicle"]');
    return vehicle ? Object.keys(vehicle).some(key => key.startsWith('__reactProps$')) : false;
  });
  await page.getByTestId('public-entry-vehicle').click();
  return page.getByTestId('accident-safety-journey');
}

async function expectNoOverflow(locator: Locator) {
  expect(await locator.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
}

test.describe('public accident safety journey', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'gate-ks-sq', 'Journey proof runs once in the KS gate.');
  });

  test('starts in every locale and reflows at the required mobile widths', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      for (const entry of localeMatrix) {
        await page.setViewportSize({ width: entry.width, height: entry.height });
        const journey = await openJourney(page, info, entry.locale);
        await expect(journey.getByRole('heading', { name: entry.title })).toBeVisible();
        await expectNoOverflow(page.locator('html'));
        await expectNoOverflow(journey);

        for (const answer of await journey.getByRole('button').all()) {
          const box = await answer.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
        const textMetrics = await journey.locator('p, button, label, select').evaluateAll(nodes =>
          nodes.map(node => ({
            fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
            tag: node.tagName,
            text: node.textContent?.trim().slice(0, 40),
          }))
        );
        expect(
          Math.min(...textMetrics.map(metric => metric.fontSize)),
          JSON.stringify(textMetrics.filter(metric => metric.fontSize < 16))
        ).toBeGreaterThanOrEqual(16);
      }
    });
  });

  test('walks the safe vehicle route and continues without repeating the category', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const journey = await openJourney(page, info);
      const materialOnly = journey.getByRole('button', { name: 'Jo, vetëm dëm material' });
      await materialOnly.focus();
      await materialOnly.press('Enter');
      await expect(
        journey.getByRole('heading', { name: /A mund të lëvizet vetura/i })
      ).toBeFocused();

      await journey.getByRole('button', { name: /Po, mund të lëvizet/i }).click();
      await journey.getByLabel('Shteti ku ndodhi aksidenti').selectOption('IT');
      await journey.getByLabel('Shteti i regjistrimit të veturës').selectOption('DE');
      await journey.getByLabel('Shteti i siguruesit ose palës tjetër').selectOption('XK');
      await expect(
        journey.getByRole('heading', { name: 'Ruani faktet e rëndësishme.' })
      ).toBeVisible();
      await journey.getByRole('button', { name: 'Ndrysho përgjigjen' }).click();
      await expect(journey.getByLabel('Shteti i siguruesit ose palës tjetër')).toHaveValue('XK');
      await journey.getByRole('button', { name: 'Vazhdo' }).click();
      await journey.getByRole('button', { name: 'Organizo të dhënat e rastit' }).click();

      await expect(page.getByTestId('free-start-intake-shell')).toBeVisible();
      await expect(page.getByTestId('free-start-category-vehicle')).toHaveCount(0);
    });
  });

  test('surfaces immediate safety outcomes before evidence guidance', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const journey = await openJourney(page, info);
      await journey.getByRole('button', { name: 'Po, dikush është lënduar' }).click();
      await expect(journey.getByRole('heading', { name: 'Siguria vjen e para.' })).toBeVisible();
      await expect(journey).not.toContainText('Ruani faktet e rëndësishme.');
    });
  });

  test('keeps the first task readable at a 200 percent zoom proxy', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 768, height: 900 });
      const journey = await openJourney(page, info);
      await page.locator('html').evaluate(element => {
        element.style.zoom = '2';
      });

      await expect(
        journey.getByRole('heading', { name: 'A është dikush i lënduar?' })
      ).toBeVisible();
      await expectNoOverflow(journey);
      await expect(journey.getByRole('button', { name: 'Jo, vetëm dëm material' })).toBeVisible();
    });
  });

  test('browser back clears the transient journey instead of restoring stale advice', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const journey = await openJourney(page, info);
      await journey.getByRole('button', { name: 'Po, dikush është lënduar' }).click();
      await page.goBack();

      await expect(page.getByTestId('accident-safety-journey')).toHaveCount(0);
      await expect(page.getByTestId('free-start-intake-shell')).toBeVisible();
    });
  });
});
