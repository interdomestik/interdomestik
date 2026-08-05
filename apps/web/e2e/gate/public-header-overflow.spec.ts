import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { routes, type Locale } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

const locales = ['sq', 'en', 'sr', 'mk'] as const;
const widths = [320, 360, 390, 430] as const;

async function persistCookieConsent(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('interdomestik_cookie_consent_v1', 'accepted');
    document.cookie = 'cookie_consent=accepted; Path=/; SameSite=Lax';
  });
}

async function openHeader(page: Page, info: TestInfo, locale: Locale) {
  await gotoApp(page, routes.home(locale), info, { marker: 'public-entry-hero' });
  return page.getByRole('banner');
}

async function applyStress(page: Page, width: number) {
  await page.setViewportSize({ width, height: 720 });
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page
    .locator('#ida-header-presentation')
    .evaluateAll(nodes => nodes.forEach(node => node.remove()));
  const tag = await page.addStyleTag({
    content:
      '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}' +
      'p{margin-bottom:2em!important}html{zoom:2}',
  });
  await tag.evaluate(node => {
    node.id = 'ida-header-presentation';
  });
  return page.evaluate(async expected => {
    await document.fonts.ready;
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    const root = document.documentElement;
    const media =
      matchMedia(`(max-width: ${expected}px)`).matches &&
      !matchMedia(`(min-width: ${expected + 1}px)`).matches &&
      matchMedia('(forced-colors: active)').matches &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (innerWidth !== expected || !media || getComputedStyle(root).zoom !== '2') {
      throw new Error('computed accessibility presentation mismatch');
    }
    return { client: root.clientWidth, scroll: root.scrollWidth };
  }, width);
}

async function expectContained(header: Locator, page: Page) {
  const geometry = await header.evaluate(element => {
    const root = document.documentElement;
    const actions = [...element.querySelectorAll<HTMLElement>('a,button')];
    return {
      documentFits: root.scrollWidth <= root.clientWidth,
      headerFits: element.scrollWidth <= element.clientWidth,
      actionsFit: actions.every(action => {
        const box = action.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth;
      }),
      targets: actions.map(action => ({
        height: action.getBoundingClientRect().height,
        width: action.getBoundingClientRect().width,
      })),
    };
  });
  expect(geometry.documentFits).toBe(true);
  expect(geometry.headerFits).toBe(true);
  expect(geometry.actionsFit).toBe(true);
  expect(geometry.targets.every(target => target.height >= 44 && target.width >= 44)).toBe(true);
  await expect(page.getByRole('link', { name: 'Interdomestik' })).toBeVisible();
}

test.describe('public header overflow containment', () => {
  test('contains the closed and open header in every locale and stress width', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await persistCookieConsent(page);
      for (const locale of locales) {
        for (const width of widths) {
          await page.setViewportSize({ width, height: 720 });
          const header = await openHeader(page, info, locale);
          const closed = await applyStress(page, width);
          expect(closed.scroll).toBeLessThanOrEqual(closed.client);
          await expectContained(header, page);

          const language = header.getByTestId('public-locale-trigger');
          await language.click();
          await expect(language).toHaveAttribute('aria-expanded', 'true');
          await expect(header.getByTestId('public-locale-option')).toHaveCount(4);
          await expectContained(header, page);
        }
      }
    });
  });

  test('preserves disclosure keyboard order and normal narrow or desktop layouts', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await persistCookieConsent(page);
      await page.setViewportSize({ width: 390, height: 844 });
      const header = await openHeader(page, info, 'sq');
      const language = header.getByTestId('public-locale-trigger');
      await language.focus();
      await language.press('Enter');
      await expect(language).toBeFocused();
      await expect(language).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Tab');
      const options = header.getByTestId('public-locale-option');
      await expect(options.first()).toBeFocused();
      await expect(options).toHaveCount(4);
      await expect(options.nth(0)).toHaveAttribute('href', /\/sq$/);
      await expect(options.nth(3)).toHaveAttribute('href', /\/mk$/);
      await page.keyboard.press('Escape');
      await expect(language).toBeFocused();
      await expect(options).toHaveCount(0);
      await language.press('Space');
      await expect(language).toHaveAttribute('aria-expanded', 'true');

      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await page.reload();
        await documentFonts(page);
        await expectContained(page.getByRole('banner'), page);
      }
    });
  });
});

async function documentFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
}
