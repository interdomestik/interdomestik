import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { routes, type Locale } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

const localeMatrix = [
  { locale: 'sq', title: /A jeni ende në aeroport/i, width: 320, height: 720 },
  { locale: 'en', title: /Are you still at the airport/i, width: 360, height: 800 },
  { locale: 'sr', title: /Da li ste još na aerodromu/i, width: 390, height: 844 },
  { locale: 'mk', title: /Дали сè уште сте на аеродромот/i, width: 430, height: 860 },
  { locale: 'sq', title: /A jeni ende në aeroport/i, width: 844, height: 390 },
] as const;

async function openJourney(page: Page, info: TestInfo, locale: Locale = 'sq') {
  await gotoApp(page, routes.home(locale), info, { marker: 'public-entry-hero' });
  const flight = page.getByTestId('public-entry-flight');
  const journey = page.getByTestId('flight-disruption-journey');
  await expect(async () => {
    await flight.click();
    await expect(journey).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await expect(page).toHaveURL(/#flight-guidance$/);
  return journey;
}

async function expectNoOverflow(locator: Locator) {
  expect(await locator.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
}

async function reachDelayResult(journey: Locator) {
  await journey.getByRole('button', { name: 'Jo' }).click();
  await journey.getByRole('button', { name: 'Fluturimi u vonua' }).click();
  await journey.getByRole('button', { name: 'Jo' }).click();
}

test.describe('public flight disruption journey', () => {
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
          .locator('p, button, a')
          .evaluateAll(nodes =>
            nodes.map(node => Number.parseFloat(getComputedStyle(node).fontSize))
          );
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
      }
    });
  });

  test('keeps active-travel guidance first and all answers transient', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const journey = await openJourney(page, info);
      const initialUrl = page.url();
      const egress: string[] = [];
      page.on('request', request => {
        if (['fetch', 'xhr'].includes(request.resourceType())) egress.push(request.url());
      });
      const active = journey.getByRole('button', { name: 'Po' });
      await active.focus();
      await active.press('Enter');
      await expect(journey.getByText(/Kërkoni ndihmën që ju duhet tani/i)).toBeVisible();
      await expect(journey.getByRole('heading', { name: /Çfarë problemi patët/i })).toBeFocused();
      await journey.getByRole('button', { name: /Fluturimi u vonua/i }).click();
      await journey.getByRole('button', { name: /Nuk jam i sigurt/i }).click();
      expect(page.url()).toBe(initialUrl);
      expect(egress).toEqual([]);
    });
  });

  test('shows airline-first free guidance without a commercial handoff', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const journey = await openJourney(page, info);
      await reachDelayResult(journey);
      await expect(journey.getByRole('heading', { name: /Merrni hapin e radhës/i })).toBeVisible();
      await expect(journey.getByRole('link', { name: /të drejtat zyrtare/i })).toHaveAttribute(
        'href',
        /europa\.eu/
      );
      await expect(journey).toContainText('nuk është aktiv në ofertën aktuale');
      await expect(journey).not.toContainText(/Free Start|anëtarësim|WhatsApp|€\s?\d/i);
    });
  });

  test('sends the assistance branch straight to health-first guidance', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const journey = await openJourney(page, info);
      await journey.getByRole('button', { name: 'Po' }).click();
      await journey.getByRole('button', { name: /aftësi të kufizuar/i }).click();
      await expect(journey).toContainText('siguria dhe shëndeti vijnë të parat');
      await expect(journey.getByRole('heading', { name: /A ju dha kompania/i })).toHaveCount(0);
    });
  });

  test('reflows at 200 percent zoom and expanded text spacing', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 768, height: 900 });
      const journey = await openJourney(page, info);
      await reachDelayResult(journey);
      await page.locator('html').evaluate(element => {
        element.style.zoom = '2';
        element.style.letterSpacing = '0.12em';
        element.style.wordSpacing = '0.16em';
        element.style.lineHeight = '1.5';
      });
      await expect(journey.getByRole('heading', { name: /Merrni hapin e radhës/i })).toBeVisible();
      await expectNoOverflow(journey);
    });
  });
});
