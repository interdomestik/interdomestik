import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { routes, type Locale } from '../routes';
import { gotoApp } from '../utils/navigation';

export const PUBLIC_FACTS_COPY = {
  en: { advice: 'Safety comes first.', narrative: 'Brief summary' },
  mk: { advice: 'Безбедноста е на прво место.', narrative: 'Кратко резиме' },
  sq: { advice: 'Siguria vjen e para.', narrative: 'Përmbledhje e shkurtër' },
  sr: { advice: 'Bezbednost je na prvom mestu.', narrative: 'Kratak sažetak' },
} as const;

/** One deliberate hero selection has to land on the editable category facts. */
async function openPublicFacts(
  page: Page,
  info: TestInfo,
  category: 'vehicle' | 'property',
  locale: Locale = 'sq',
  keyboard = false
) {
  await gotoApp(page, routes.home(locale), info, { marker: 'public-entry-hero' });
  const action = page.getByTestId(`public-entry-${category}`);
  const advice = page.getByTestId('free-start-urgent-advice');
  await expect(action).toHaveAttribute('data-public-entry-ready', 'true');
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
    await action.focus();
    await page.keyboard.press('Enter');
  } else {
    await action.click();
  }
  await expect(advice).toBeVisible();
  await expect(page.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert');
  await expect(advice).toHaveAttribute('data-category', category);
  return page.getByTestId('premium-free-start-organizer');
}

export function createPublicFactsEntry(category: 'vehicle' | 'property') {
  return (page: Page, info: TestInfo, locale: Locale = 'sq', keyboard = false) =>
    openPublicFacts(page, info, category, locale, keyboard);
}

export async function expectNoOverflow(locator: Locator) {
  expect(await locator.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
}

export async function expectUsefulArrival(
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

export async function expectReadableControls(organizer: Locator, buttons: Locator = organizer) {
  for (const control of await buttons.getByRole('button').all()) {
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  const fontSizes = await organizer
    .locator('button, input, select, textarea')
    .evaluateAll(nodes => nodes.map(node => Number.parseFloat(getComputedStyle(node).fontSize)));
  expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(16);
}

export async function expectKeyboardSafetyReturn(
  page: Page,
  organizer: Locator,
  category: 'vehicle' | 'property',
  copy: { narrative: string; advice: string }
) {
  const narrative = organizer.getByLabel(copy.narrative);
  const label = organizer.getByRole('heading', { name: copy.narrative, exact: true });
  await expect(label).toBeFocused();
  await expect(narrative).not.toBeFocused();
  await expectUsefulArrival(page, organizer, copy.narrative, copy.advice);
  await narrative.fill('Faktet mbeten gjatë leximit të këshillës.');
  const node = await narrative.elementHandle();
  // A second deliberate activation of the same hash still reaches the facts once.
  await page.getByTestId(`public-entry-${category}`).focus();
  await page.keyboard.press('Enter');
  await expect(label).toBeFocused();
  await expectUsefulArrival(page, organizer, copy.narrative, copy.advice);
  const cue = organizer.getByRole('link', { name: copy.advice, exact: true });
  await cue.focus();
  await page.keyboard.press('Enter');
  const advice = organizer.getByRole('heading', { name: copy.advice, exact: true });
  await expect(advice).toBeFocused();
  await expect(advice).toBeInViewport({ ratio: 1 });
  const header = await page.getByTestId('public-header').boundingBox();
  expect((await advice.boundingBox())!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  await organizer.getByRole('link', { name: copy.narrative, exact: true }).click();
  await expect(label).toBeFocused();
  await expectUsefulArrival(page, organizer, copy.narrative, copy.advice);
  expect(await narrative.evaluate((element, original) => element === original, node)).toBe(true);
  await expect(narrative).toHaveValue('Faktet mbeten gjatë leximit të këshillës.');
}
