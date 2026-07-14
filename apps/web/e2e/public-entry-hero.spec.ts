import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { routes, type Locale } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';

const viewports = [
  { width: 320, height: 720 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
];

async function openHero(page: Page, testInfo: TestInfo, locale: Locale = 'sq') {
  await gotoApp(page, routes.home(locale), testInfo, { marker: 'public-entry-hero' });
  return page.getByTestId('public-entry-hero');
}

async function expectNoOverflow(locator: Locator) {
  expect(await locator.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
}

async function expectReadableContrast(hero: Locator) {
  const ratios = await hero.locator('h1, p, a, span, small').evaluateAll(elements => {
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
        if (value !== 'rgba(0, 0, 0, 0)') return value;
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

test.describe('Help Now public entry', () => {
  test('keeps the same truthful help-first contract in all locales', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      for (const locale of ['sq', 'en', 'sr', 'mk'] as const) {
        const hero = await openHero(page, info, locale);
        await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
        for (const id of ['vehicle', 'injury', 'property'] as const) {
          await expect(hero.getByTestId(`public-entry-${id}`)).toHaveAttribute(
            'href',
            /#free-start-intake$/
          );
        }
        await expect(hero.getByTestId('public-entry-flight').getByRole('link')).toHaveCount(0);
        await expect(hero.getByText(/WhatsApp/i)).toHaveCount(2);
        await expect(hero.getByTestId('public-entry-membership')).toHaveAttribute(
          'href',
          new RegExp(`/${locale}/pricing$`)
        );
        await expect(hero).not.toContainText(/4\.9|8[.,]500|100\s?%|24\/7|guarantee|garant/i);
        await expectNoOverflow(hero);
      }
    });
  });

  test('keeps header and hero controls accessible by keyboard', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const hero = await openHero(page, info);
      const language = page.getByRole('button', { name: /gjuha/i });
      await language.focus();
      await expect(language).toBeFocused();
      await language.press('Enter');
      await expect(page.getByTestId('public-locale-option')).toHaveCount(4);
      await language.press('Escape');

      const vehicle = hero.getByTestId('public-entry-vehicle');
      await vehicle.focus();
      await expect(vehicle).toBeFocused();
      await vehicle.press('Enter');
      await expect(page).toHaveURL(/#free-start-intake$/);
    });
  });

  test('protects readable mobile reflow, targets, contrast, and reduced motion', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        const locale: Locale = viewport.width === 390 ? 'mk' : 'sq';
        const hero = await openHero(page, info, locale);
        await expectNoOverflow(page.locator('html'));
        await expectNoOverflow(hero);
        for (const action of await hero.getByRole('link').all()) {
          const box = await action.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
          expect(box?.width).toBeGreaterThanOrEqual(44);
        }
        await expectReadableContrast(hero);
        const duration = await hero
          .getByTestId('public-entry-vehicle')
          .locator('svg:last-child')
          .evaluate(element => Number.parseFloat(getComputedStyle(element).transitionDuration));
        expect(duration).toBeLessThan(0.001);
        if ([375, 390, 1440].includes(viewport.width)) {
          await hero.screenshot({
            path: info.outputPath(`help-now-${locale}-${viewport.width}.png`),
          });
        }
      }
    });
  });
});
