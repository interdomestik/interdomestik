import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { routes, type Locale } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';
const viewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 720, height: 760 },
  { width: 768, height: 900 },
  { width: 1024, height: 768 },
  { width: 1440, height: 760 },
  { width: 844, height: 390 },
];
async function openHero(page: Page, testInfo: TestInfo, locale: Locale = 'sq') {
  await gotoApp(page, routes.home(locale), testInfo, { marker: 'public-entry-hero' });
  return page.getByTestId('public-entry-hero');
}
async function expectNoOverflow(locator: Locator) {
  const fits = await locator.evaluate(element => element.scrollWidth <= element.clientWidth + 1);
  expect(fits).toBe(true);
}
async function expectReadableContrast(hero: Locator) {
  const ratios = await hero.locator('h1, p, a span').evaluateAll(elements => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (value: string) => {
      const channels = rgb(value).map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const background = (element: Element) => {
      let current: Element | null = element;
      while (current) {
        const value = getComputedStyle(current).backgroundColor;
        if (!value.endsWith(', 0)') && value !== 'rgba(0, 0, 0, 0)') return value;
        current = current.parentElement;
      }
      return 'rgb(255, 255, 255)';
    };
    return elements
      .filter(element => element.children.length === 0 && element.textContent?.trim())
      .map(element => {
        const foreground = luminance(getComputedStyle(element).color);
        const behind = luminance(background(element));
        return (Math.max(foreground, behind) + 0.05) / (Math.min(foreground, behind) + 0.05);
      });
  });
  expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
}
test.describe('public entry hero', () => {
  test('renders localized semantics and truthful destinations', async ({ browser }, testInfo) => {
    await withAnonymousPage(browser, testInfo, async page => {
      for (const locale of ['sq', 'en', 'sr', 'mk'] as const) {
        const hero = await openHero(page, testInfo, locale);
        await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(hero.getByRole('link')).toHaveCount(3);
        await expect(page.getByTestId('public-entry-membership')).toHaveAttribute(
          'href',
          new RegExp(`/${locale}/pricing$`)
        );
        await expect(page.getByTestId('public-entry-help-now')).toHaveAttribute(
          'href',
          new RegExp(`/${locale}/help-now$`)
        );
        await expect(page.getByTestId('public-entry-case-organize')).toHaveAttribute(
          'href',
          /#free-start-intake$/
        );
        await expect(hero).not.toContainText(/4\.9|8[.,]500|100\s?%|24\/7|guarantee|garant/i);
        await expectNoOverflow(hero);
      }
    });
  });
  test('supports visible keyboard activation in the action hierarchy', async ({
    browser,
  }, testInfo) => {
    await withAnonymousPage(browser, testInfo, async page => {
      await openHero(page, testInfo);
      const actions = ['public-entry-membership', 'public-entry-help-now'] as const;
      for (const testId of actions) {
        const action = page.getByTestId(testId);
        await action.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(action).toBeFocused();
        expect(await action.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe(
          'none'
        );
        await page.keyboard.press('Enter');
        await expect(page).not.toHaveURL(/\/sq\/?$/);
        await page.goBack({ waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('public-entry-hero')).toBeVisible();
      }
      const organize = page.getByTestId('public-entry-case-organize');
      await organize.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#free-start-intake$/);
    });
  });
  test('protects responsive targets, reduced motion, and hero screenshots', async ({
    browser,
  }, testInfo) => {
    await withAnonymousPage(browser, testInfo, async page => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        const locale: Locale = viewport.width === 390 ? 'mk' : 'sq';
        const hero = await openHero(page, testInfo, locale);
        await expectNoOverflow(page.locator('html'));
        await expectNoOverflow(hero);
        for (const action of await hero.getByRole('link').all()) {
          const box = await action.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
          expect(box?.width).toBeGreaterThanOrEqual(44);
        }
        await expectReadableContrast(hero);
        const actionBoxes = await hero.getByRole('link').evaluateAll(elements =>
          elements.map(element => {
            const box = element.getBoundingClientRect();
            return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
          })
        );
        for (let index = 1; index < actionBoxes.length; index += 1) {
          const previous = actionBoxes[index - 1];
          const current = actionBoxes[index];
          const horizontalGap = Math.max(
            current.left - previous.right,
            previous.left - current.right
          );
          const verticalGap = Math.max(
            current.top - previous.bottom,
            previous.top - current.bottom
          );
          expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(8);
        }
        const duration = await page
          .getByTestId('public-entry-help-now')
          .locator('svg')
          .evaluate(element => Number.parseFloat(getComputedStyle(element).transitionDuration));
        expect(duration).toBeLessThan(0.001);
        if ([375, 390, 1440].includes(viewport.width)) {
          await hero.screenshot({
            path: testInfo.outputPath(`public-entry-${locale}-${viewport.width}.png`),
          });
        }
      }
    });
  });
});
