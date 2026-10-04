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
  { locale: 'sq', width: 360, height: 800 },
  { locale: 'en', width: 375, height: 812 },
  { locale: 'sr', width: 390, height: 844 },
  { locale: 'mk', width: 430, height: 860 },
  { locale: 'sq', width: 844, height: 390 },
  { locale: 'sq', width: 1440, height: 1024 },
] as const;

/** One deliberate hero selection has to land on the editable property facts. */
async function openPropertyEntry(
  page: Page,
  info: TestInfo,
  locale: Locale = 'sq',
  keyboard = false
) {
  await gotoApp(page, routes.home(locale), info, { marker: 'public-entry-hero' });
  const property = page.getByTestId('public-entry-property');
  const advice = page.getByTestId('free-start-urgent-advice');
  await expect(property).toHaveAttribute('data-public-entry-ready', 'true');
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
    await property.focus();
    await page.keyboard.press('Enter');
  } else {
    await property.click();
  }
  await expect(advice).toBeVisible();
  await expect(page.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert');
  await expect(advice).toHaveAttribute('data-category', 'property');
  return page.getByTestId('premium-free-start-organizer');
}

async function expectNoOverflow(locator: Locator) {
  expect(await locator.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
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

test.describe('public property reporting entry', () => {
  test('opens the property facts in every locale with readable mobile controls', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      for (const entry of localeMatrix) {
        await page.setViewportSize({ width: entry.width, height: entry.height });
        const organizer = await openPropertyEntry(page, info, entry.locale);
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
        const sizes = await organizer
          .locator('button, input, select, textarea')
          .evaluateAll(nodes =>
            nodes.map(node => Number.parseFloat(getComputedStyle(node).fontSize))
          );
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
      }
    });
  });

  test('keeps the danger advice visible with the EU-qualified 112 message', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const organizer = await openPropertyEntry(page, info);
      const advice = organizer.getByTestId('free-start-urgent-advice');

      await expect(advice).toContainText('largohuni nga rreziku');
      await expect(advice).toContainText('Mos hyni përsëri');
      await expect(advice).toContainText('Nëse ndodheni në BE');
      // The advice sits above the facts editor instead of gating it.
      const position = await page.evaluate(() => {
        const node = document.querySelector('[data-testid="free-start-urgent-advice"]');
        const editor = document.querySelector('[data-testid="free-start-recovery-editor"]');
        if (!node || !editor) return 0;
        return node.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING;
      });
      expect(position).not.toBe(0);
    });
  });

  test('keeps the entry transient and starts the property facts without extra questions', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      const organizer = await openPropertyEntry(page, info);
      await expect(page).toHaveURL(/#free-start-intake$/);
      const initialUrl = page.url();
      const egress: string[] = [];
      page.on('request', request => {
        if (['fetch', 'xhr'].includes(request.resourceType())) egress.push(request.url());
      });

      await expect(page.getByTestId('property-safety-journey')).toHaveCount(0);
      await expect(page.getByLabel('Shteti ku ndodhet prona')).toHaveCount(0);
      await expect(organizer.getByTestId('free-start-category-property')).toHaveCount(0);
      await expect(organizer.getByText('Po vazhdoni për:')).toBeVisible();

      const narrative = organizer.getByLabel(COPY.sq.narrative);
      await narrative.click();
      await narrative.fill('Uji dëmtoi garazhën dhe sallonin.');
      await expect(narrative).toBeFocused();
      await expect(narrative).toHaveValue('Uji dëmtoi garazhën dhe sallonin.');
      expect(page.url()).toBe(initialUrl);
      expect(egress).toEqual([]);
    });
  });

  test('reflows at 200 percent zoom and with expanded text spacing', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 768, height: 900 });
      const organizer = await openPropertyEntry(page, info);
      await page.locator('html').evaluate(element => {
        element.style.zoom = '2';
        element.style.letterSpacing = '0.12em';
        element.style.wordSpacing = '0.16em';
        element.style.lineHeight = '1.5';
      });

      await expect(organizer.getByRole('heading', { name: COPY.sq.advice })).toBeVisible();
      await expect(organizer.getByLabel(COPY.sq.narrative)).toBeVisible();
      await expectNoOverflow(organizer);
    });
  });

  test('keyboard and same-hash arrival keep safety reachable and retain the facts', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const organizer = await openPropertyEntry(page, info, 'sq', true);
      const narrative = organizer.getByLabel(COPY.sq.narrative);
      const label = organizer.getByRole('heading', { name: COPY.sq.narrative, exact: true });
      await expect(label).toBeFocused();
      await expect(narrative).not.toBeFocused();
      await expectUsefulArrival(page, organizer, COPY.sq.narrative, COPY.sq.advice);
      await narrative.fill('Faktet mbeten gjatë leximit të këshillës.');
      const node = await narrative.elementHandle();
      // A second deliberate activation of the same hash still reaches the facts once.
      await page.getByTestId('public-entry-property').focus();
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
