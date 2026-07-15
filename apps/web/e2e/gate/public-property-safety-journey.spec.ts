import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { routes, type Locale } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

const localeMatrix = [
  { locale: 'sq', title: /A ka ende rrezik aktiv/i, width: 360, height: 800 },
  { locale: 'en', title: /Is there still an active danger/i, width: 375, height: 812 },
  { locale: 'sr', title: /Da li i dalje postoji neposredna opasnost/i, width: 390, height: 844 },
  { locale: 'mk', title: /Дали сè уште постои непосредна опасност/i, width: 430, height: 860 },
  { locale: 'sq', title: /A ka ende rrezik aktiv/i, width: 844, height: 390 },
] as const;

async function openJourney(page: Page, info: TestInfo, locale: Locale = 'sq') {
  await gotoApp(page, routes.home(locale), info, { marker: 'public-entry-hero' });
  const property = page.getByTestId('public-entry-property');
  const journey = page.getByTestId('property-safety-journey');
  await expect(async () => {
    await property.click();
    await expect(journey).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  return journey;
}

async function expectNoOverflow(locator: Locator) {
  expect(await locator.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
}

async function reachResult(journey: Locator) {
  await journey.getByRole('button', { name: 'Jo' }).click();
  await journey.getByRole('button', { name: /Ujë, rrjedhje/i }).click();
  await journey.getByRole('button', { name: 'Po' }).click();
  await journey.getByRole('button', { name: 'Qiramarrës' }).click();
  await journey.getByLabel('Shteti ku ndodhet prona').selectOption('IT');
  await journey.getByRole('button', { name: 'Vazhdo' }).click();
  await journey.getByLabel('Shteti i vendbanimit të zakonshëm').selectOption('DE');
  await journey.getByRole('button', { name: 'Vazhdo' }).click();
}

test.describe('public property safety journey', () => {
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

  test('fails uncertainty closed with the EU-qualified 112 message', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const journey = await openJourney(page, info);
      await journey.getByRole('button', { name: 'Nuk jam i sigurt' }).click();
      await expect(journey.getByRole('heading', { name: /Largohuni nga rreziku/i })).toBeVisible();
      await expect(journey).toContainText('Nëse ndodheni në BE');
      await expect(journey).not.toContainText('Organizo të dhënat');
    });
  });

  test('keeps answers transient and starts a fresh property intake', async ({ browser }, info) => {
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
      await expect(journey.getByRole('heading', { name: /Çfarë lloj dëmi/i })).toBeFocused();
      await journey.getByRole('button', { name: /Ujë, rrjedhje/i }).click();
      await journey.getByRole('button', { name: 'Po' }).click();
      await journey.getByRole('button', { name: 'Qiramarrës' }).click();
      await journey.getByLabel('Shteti ku ndodhet prona').selectOption('IT');
      await journey.getByRole('button', { name: 'Vazhdo' }).click();
      await journey.getByLabel('Shteti i vendbanimit të zakonshëm').selectOption('DE');
      await journey.getByRole('button', { name: 'Vazhdo' }).click();
      expect(page.url()).toBe(initialUrl);
      expect(egress).toEqual([]);
      await journey.getByRole('button', { name: /Organizo të dhënat e dëmit tim/i }).click();
      await expect(page.getByTestId('free-start-intake-shell')).toBeVisible();
      await expect(page.getByTestId('free-start-category-property')).toHaveCount(0);
    });
  });

  test('reflows at 200 percent zoom and with expanded text spacing', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 768, height: 900 });
      const journey = await openJourney(page, info);
      await reachResult(journey);
      await page.locator('html').evaluate(element => {
        element.style.zoom = '2';
        element.style.letterSpacing = '0.12em';
        element.style.wordSpacing = '0.16em';
        element.style.lineHeight = '1.5';
      });
      await expect(journey.getByRole('heading', { name: /Mbroni njerëzit/i })).toBeVisible();
      await expectNoOverflow(journey);
    });
  });
});
