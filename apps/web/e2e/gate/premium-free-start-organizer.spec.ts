import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { routes, type Locale } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

const localeMatrix = [
  { locale: 'sq', heading: /Mblidhni faktet kryesore/i, width: 360 },
  { locale: 'en', heading: /Gather the key facts/i, width: 375 },
  { locale: 'sr', heading: /Sakupite ključne činjenice/i, width: 390 },
  { locale: 'mk', heading: /Соберете ги клучните факти/i, width: 430 },
] as const;

async function openOrganizer(page: Page, info: TestInfo, locale: Locale) {
  await gotoApp(page, routes.home(locale), info, { marker: 'free-start-intake-shell' });
  const organizer = page.getByTestId('premium-free-start-organizer');
  await expect(organizer).toBeVisible();
  return organizer;
}

async function expectNoOverflow(locator: Locator) {
  expect(await locator.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
}

test.describe('premium Free Start organizer', () => {
  test('keeps the direct fallback readable in every canonical locale', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      for (const entry of localeMatrix) {
        await page.setViewportSize({ width: entry.width, height: 844 });
        const organizer = await openOrganizer(page, info, entry.locale);
        await expect(organizer.getByRole('heading', { name: entry.heading })).toBeVisible();
        await expect(organizer).toHaveAttribute('data-save-behavior', 'device-recovery');
        await expect(organizer.getByTestId('free-start-trust-boundary')).toBeVisible();
        const anchorTarget = page.getByTestId('free-start-intake-shell');
        await anchorTarget.evaluate(element => element.scrollIntoView({ block: 'start' }));
        expect((await anchorTarget.boundingBox())?.y).toBeGreaterThanOrEqual(72);
        await expectNoOverflow(page.locator('html'));
        await expectNoOverflow(organizer);

        const controls = await organizer.getByRole('button').all();
        for (const control of controls) {
          expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        }
        const fontSizes = await organizer
          .locator('button, input, select, textarea')
          .evaluateAll(nodes =>
            nodes.map(node => Number.parseFloat(getComputedStyle(node).fontSize))
          );
        expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(16);
      }
    });
  });

  test('continues the property journey without asking for category again', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoApp(page, routes.home('sq'), info, { marker: 'public-entry-hero' });
      const propertyAction = page.getByTestId('public-entry-property');
      const journey = page.getByTestId('property-safety-journey');
      await expect(async () => {
        await propertyAction.click();
        await expect(journey).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 10_000 });
      await journey.getByRole('button', { name: 'Jo' }).click();
      await journey.getByRole('button', { name: /Ujë, rrjedhje/i }).click();
      await journey.getByRole('button', { name: 'Po' }).click();
      await journey.getByRole('button', { name: 'Qiramarrës' }).click();
      await journey.getByLabel('Shteti ku ndodhet prona').selectOption('IT');
      await journey.getByRole('button', { name: 'Vazhdo' }).click();
      await journey.getByLabel('Shteti i vendbanimit të zakonshëm').selectOption('DE');
      await journey.getByRole('button', { name: 'Vazhdo' }).click();
      await journey.getByRole('button', { name: /Organizo të dhënat e dëmit tim/i }).click();

      const organizer = page.getByTestId('premium-free-start-organizer');
      await expect(organizer.getByText('Po vazhdoni për:')).toBeVisible();
      await expect(organizer.getByTestId('free-start-category-property')).toHaveCount(0);
      await expect(organizer.getByLabel('Çfarë ndodhi?')).toBeVisible();
    });
  });

  test('reflows at 200 percent zoom with expanded text spacing', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 768, height: 900 });
      const organizer = await openOrganizer(page, info, 'sq');
      await page.locator('html').evaluate(element => {
        element.style.zoom = '2';
        element.style.letterSpacing = '0.12em';
        element.style.wordSpacing = '0.16em';
        element.style.lineHeight = '1.5';
      });
      await expect(
        organizer.getByRole('heading', { name: /Mblidhni faktet kryesore/i })
      ).toBeVisible();
      await expectNoOverflow(organizer);
    });
  });

  test('keeps the category fallback visible without JavaScript', async ({ browser }, info) => {
    const context = await browser.newContext({
      baseURL: info.project.use.baseURL,
      extraHTTPHeaders: info.project.use.extraHTTPHeaders,
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    try {
      const organizer = await openOrganizer(page, info, 'sq');
      await expect(organizer.getByTestId('free-start-category-vehicle')).toBeVisible();
      await expect(organizer.getByTestId('free-start-category-property')).toBeVisible();
      await expect(organizer.getByTestId('free-start-category-injury')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
