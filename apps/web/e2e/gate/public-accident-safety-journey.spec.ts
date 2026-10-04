import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { routes, type Locale } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

const COPY = {
  en: { advice: 'Safety comes first.', narrative: 'Brief summary' },
  mk: { advice: 'Безбедноста е на прво место.', narrative: 'Кратко резиме' },
  sq: { advice: 'Siguria vjen e para.', narrative: 'Përmbledhje e shkurtër' },
  sr: { advice: 'Bezbednost je na prvom mestu.', narrative: 'Kratak sažetak' },
} as const;

const localeMatrix = [
  { locale: 'sq', width: 320, height: 720 },
  { locale: 'en', width: 375, height: 812 },
  { locale: 'sr', width: 390, height: 844 },
  { locale: 'mk', width: 768, height: 900 },
  { locale: 'sq', width: 1024, height: 768 },
  { locale: 'sq', width: 1440, height: 900 },
  { locale: 'sq', width: 844, height: 390 },
] as const;

/** One deliberate hero selection has to land on the editable vehicle facts. */
async function openVehicleEntry(
  page: Page,
  info: TestInfo,
  locale: Locale = 'sq',
  keyboard = false
) {
  await gotoApp(page, routes.home(locale), info, { marker: 'public-entry-hero' });
  const vehicle = page.getByTestId('public-entry-vehicle');
  const advice = page.getByTestId('free-start-urgent-advice');
  await expect(vehicle).toHaveAttribute('data-public-entry-ready', 'true');
  // Cookie preference is separate from the one situation action.
  const consent = await page.evaluate(() =>
    localStorage.getItem('interdomestik_cookie_consent_v1')
  );
  if (!consent) {
    await page.getByTestId('cookie-consent-decline').click();
    await expect(page.getByTestId('cookie-consent-banner')).toHaveCount(0);
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  if (keyboard) {
    await vehicle.focus();
    await page.keyboard.press('Enter');
  } else {
    await vehicle.click();
  }
  await expect(advice).toBeVisible();
  await expect(page.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert');
  await expect(advice).toHaveAttribute('data-category', 'vehicle');
  return page.getByTestId('premium-free-start-organizer');
}

async function expectNoOverflow(locator: Locator) {
  expect(await locator.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
}

async function expectAdviceAbove(page: Page, testId: string) {
  const position = await page.evaluate(selector => {
    const advice = document.querySelector('[data-testid="free-start-urgent-advice"]');
    const target = document.querySelector(selector);
    if (!advice || !target) return 0;
    return advice.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING;
  }, `[data-testid="${testId}"]`);
  expect(position).not.toBe(0);
}

async function expectUsefulArrival(
  page: Page,
  organizer: Locator,
  narrative: string,
  advice: string
) {
  const cue = organizer.getByRole('link', { name: advice, exact: true });
  await expect(cue).toHaveAttribute('href', '#free-start-urgent-advice-heading');
  await expect(cue).toBeInViewport({ ratio: 1 });
  await expect
    .poll(async () => {
      return organizer.getByLabel(narrative).evaluate(element => {
        const field = element.getBoundingClientRect();
        const header = document
          .querySelector('[data-testid="public-header"]')
          ?.getBoundingClientRect();
        return Math.min(field.bottom, innerHeight) - Math.max(field.top, header?.bottom ?? 0);
      });
    })
    .toBeGreaterThanOrEqual(80);
  const label = organizer.getByRole('heading', { name: narrative, exact: true });
  await expect(label).toBeInViewport({ ratio: 1 });
  const headerBottom = (await page.getByTestId('public-header').boundingBox())!.height;
  expect((await cue.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom);
  expect((await label.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom);
}

test.describe('public vehicle reporting entry', () => {
  test('opens the vehicle facts in every locale and reflows at the required mobile widths', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      for (const entry of localeMatrix) {
        await page.setViewportSize({ width: entry.width, height: entry.height });
        const organizer = await openVehicleEntry(page, info, entry.locale);
        const copy = COPY[entry.locale];
        const narrative = organizer.getByLabel(copy.narrative);
        await expect(organizer.getByRole('heading', { name: copy.advice })).toBeVisible();
        await expect(narrative).toBeVisible();
        // One hero selection has to land the first narrative in view without any manual scrolling.
        await expect(narrative).toBeInViewport();
        await expectUsefulArrival(page, organizer, copy.narrative, copy.advice);
        await expectNoOverflow(page.locator('html'));
        await expectNoOverflow(organizer);

        const editor = organizer.getByTestId('free-start-recovery-editor');
        for (const control of await editor.getByRole('button').all()) {
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

  test('explains the problem first, with qualified urgent advice and no transmission', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      const organizer = await openVehicleEntry(page, info);
      const initialUrl = page.url();
      const egress: string[] = [];
      page.on('request', request => {
        if (['fetch', 'xhr'].includes(request.resourceType())) egress.push(request.url());
      });

      const advice = organizer.getByTestId('free-start-urgent-advice');
      await expect(advice).toContainText('kërkoni menjëherë vlerësim profesional ose emergjent');
      await expect(advice).toContainText('mos e lëvizni veturën');
      await expect(advice).toContainText('Nëse ndodheni në BE');
      // The removed question stages are gone, not merely hidden behind another click.
      await expect(page.getByTestId('accident-safety-journey')).toHaveCount(0);
      await expect(page.getByLabel('Shteti ku ndodhi aksidenti')).toHaveCount(0);
      await expect(organizer.getByTestId('free-start-category-vehicle')).toHaveCount(0);

      const narrative = organizer.getByLabel(COPY.sq.narrative);
      await narrative.click();
      await narrative.fill('Vetura u dëmtua në parking dhe siguruesi nuk përgjigjet.');
      await expect(narrative).toBeFocused();
      await expect(narrative).toHaveValue(
        'Vetura u dëmtua në parking dhe siguruesi nuk përgjigjet.'
      );
      expect(page.url()).toBe(initialUrl);
      expect(egress).toEqual([]);
    });
  });

  test('keeps the injury and movement advice above the facts editor', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openVehicleEntry(page, info);
      await expectAdviceAbove(page, 'free-start-recovery-editor');
    });
  });

  test('keeps the first narrative readable at a 200 percent zoom proxy', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 768, height: 900 });
      const organizer = await openVehicleEntry(page, info);
      await page.locator('html').evaluate(element => {
        element.style.zoom = '2';
      });

      await expect(organizer.getByRole('heading', { name: COPY.sq.advice })).toBeVisible();
      await expect(organizer.getByLabel(COPY.sq.narrative)).toBeVisible();
      await expectNoOverflow(organizer);
    });
  });

  test('browser back keeps the entered facts instead of restoring a removed stage', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const organizer = await openVehicleEntry(page, info);
      const narrative = organizer.getByLabel(COPY.sq.narrative);
      await narrative.fill('Dëmtim në parking.');
      await page.goBack();

      await expect(page.getByTestId('accident-safety-journey')).toHaveCount(0);
      await expect(page.getByTestId('free-start-intake-shell')).toBeVisible();
      await expect(organizer.getByLabel(COPY.sq.narrative)).toHaveValue('Dëmtim në parking.');
    });
  });

  test('keyboard and same-hash arrival keep safety reachable and retain the facts', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const organizer = await openVehicleEntry(page, info, 'sq', true);
      const narrative = organizer.getByLabel(COPY.sq.narrative);
      const label = organizer.getByRole('heading', { name: COPY.sq.narrative, exact: true });
      await expect(label).toBeFocused();
      await expect(narrative).not.toBeFocused();
      await expectUsefulArrival(page, organizer, COPY.sq.narrative, COPY.sq.advice);
      await narrative.fill('Faktet mbeten gjatë leximit të këshillës.');
      const node = await narrative.elementHandle();
      // A second deliberate activation of the same hash still reaches the facts once.
      await page.getByTestId('public-entry-vehicle').focus();
      await page.keyboard.press('Enter');
      await expect(label).toBeFocused();
      await expectUsefulArrival(page, organizer, COPY.sq.narrative, COPY.sq.advice);
      const cue = organizer.getByRole('link', { name: COPY.sq.advice, exact: true });
      await cue.focus();
      await page.keyboard.press('Enter');
      const advice = organizer.getByRole('heading', { name: COPY.sq.advice, exact: true });
      await expect(advice).toBeFocused();
      await expect(advice).toBeInViewport({ ratio: 1 });
      const header = await page.getByTestId('public-header').boundingBox();
      expect((await advice.boundingBox())!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
      await organizer.getByRole('link', { name: COPY.sq.narrative, exact: true }).click();
      await expect(label).toBeFocused();
      await expectUsefulArrival(page, organizer, COPY.sq.narrative, COPY.sq.advice);
      expect(await narrative.evaluate((element, original) => element === original, node)).toBe(
        true
      );
      await expect(narrative).toHaveValue('Faktet mbeten gjatë leximit të këshillës.');
    });
  });
});
