import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { routes, type Locale } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

const localeMatrix = [
  { locale: 'sq', title: /A jeni tani në rrezik/i, width: 360, height: 800 },
  { locale: 'en', title: /Are you in danger now/i, width: 375, height: 812 },
  { locale: 'sr', title: /Da li ste sada u opasnosti/i, width: 390, height: 844 },
  { locale: 'mk', title: /Дали сте сега во опасност/i, width: 430, height: 860 },
  { locale: 'sq', title: /A jeni tani në rrezik/i, width: 844, height: 390 },
] as const;

async function openJourney(page: Page, info: TestInfo, locale: Locale = 'sq') {
  await gotoApp(page, routes.home(locale), info, { marker: 'public-entry-hero' });
  const injury = page.getByTestId('public-entry-injury');
  const journey = page.getByTestId('injury-safety-journey');
  await expect(async () => {
    await injury.click();
    await expect(journey).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  return journey;
}

async function expectNoOverflow(locator: Locator) {
  expect(await locator.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
}

test.describe('public injury safety journey', () => {
  test('starts in every locale with readable mobile controls', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      for (const entry of localeMatrix) {
        await page.setViewportSize({ width: entry.width, height: entry.height });
        const journey = await openJourney(page, info, entry.locale);
        await expect(journey.getByRole('heading', { name: entry.title })).toBeVisible();
        await expectNoOverflow(page.locator('html'));
        await expectNoOverflow(journey);
        for (const answer of await journey.getByRole('button').all()) {
          expect((await answer.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        }
        const sizes = await journey
          .locator('p, button, label, select')
          .evaluateAll(nodes =>
            nodes.map(node => Number.parseFloat(getComputedStyle(node).fontSize))
          );
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
      }
    });
  });

  test('keeps urgent answers before sales and gives the EU 112 qualifier', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const journey = await openJourney(page, info);
      await journey.getByRole('button', { name: 'Nuk jam i sigurt' }).click();
      await expect(
        journey.getByRole('heading', { name: 'Siguria juaj vjen e para.' })
      ).toBeVisible();
      await expect(journey).toContainText('Në Bashkimin Evropian');
      await expect(journey).not.toContainText('Organizo të dhënat');
    });
  });

  test('completes a traffic route with no answer egress and a fresh injury handoff', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const journey = await openJourney(page, info);
      await expect(page).toHaveURL(/#free-start-intake$/);
      const initialUrl = page.url();
      const egress: string[] = [];
      page.on('request', request => {
        if (['fetch', 'xhr'].includes(request.resourceType())) egress.push(request.url());
      });
      const safe = journey.getByRole('button', { name: 'Jo' });
      await safe.focus();
      await safe.press('Enter');
      await expect(journey.getByRole('heading', { name: 'Si ndodhi lëndimi?' })).toBeFocused();
      await journey.getByRole('button', { name: 'Aksident në trafik' }).click();
      await journey.getByLabel('Shteti ku ndodhi incidenti').selectOption('IT');
      await journey.getByRole('button', { name: 'Vazhdo' }).click();
      await journey.getByLabel('Shteti i vendbanimit të zakonshëm').selectOption('DE');
      await journey.getByRole('button', { name: 'Vazhdo' }).click();
      await expect(journey.getByRole('heading', { name: /Ruani faktet/i })).toBeVisible();
      expect(page.url()).toBe(initialUrl);
      expect(egress).toEqual([]);
      await journey.getByRole('button', { name: /Organizo të dhënat e rastit tim/i }).click();
      await expect(page.getByTestId('free-start-intake-shell')).toBeVisible();
      await expect(page.getByTestId('free-start-category-injury')).toHaveCount(0);
    });
  });

  test('reflows the source list at a 200 percent zoom proxy', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 768, height: 900 });
      const journey = await openJourney(page, info);
      await journey.getByRole('button', { name: 'Jo' }).click();
      await page.locator('html').evaluate(element => (element.style.zoom = '2'));
      await expect(journey.getByRole('heading', { name: 'Si ndodhi lëndimi?' })).toBeVisible();
      await expectNoOverflow(journey);
      await expect(
        journey.getByRole('button', { name: 'Problem i dyshuar gjatë trajtimit' })
      ).toBeVisible();
    });
  });
});
