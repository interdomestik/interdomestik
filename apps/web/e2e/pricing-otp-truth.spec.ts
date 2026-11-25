import { expect, test, type Locator, type Page } from '@playwright/test';

import { routes } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';

const localeMatrix = [
  {
    locale: 'sq',
    plan: 'Plani Asistenca',
    notice: 'Blerja e anëtarësive është përkohësisht e mbyllur.',
  },
  {
    locale: 'en',
    plan: 'Asistenca',
    notice: 'Membership purchases are currently closed.',
  },
  {
    locale: 'sr',
    plan: 'Asistenca (Standard)',
    notice: 'Kupovina članstva trenutno je zatvorena.',
  },
  {
    locale: 'mk',
    plan: 'Асистенца',
    notice: 'Купувањето членство моментално е затворено.',
  },
  {
    locale: 'de',
    plan: 'Asistenca',
    notice: 'Der Kauf von Mitgliedschaften ist derzeit geschlossen.',
  },
] as const;

async function expectNoCheckout(page: Page) {
  await expect(page.getByTestId(/^plan-cta-/)).toHaveCount(0);
  await expect(page.getByTestId('pricing-precheckout-confirmation')).toHaveCount(0);
  await expect(page.getByTestId('precheckout-continue-cta')).toHaveCount(0);
  await expect(page.getByTestId(/^pricing-otp-/)).toHaveCount(0);
  await expect(page.locator('script[src*="paddle.com"]')).toHaveCount(0);
}

async function watchPaddleRequests(page: Page) {
  const requests: string[] = [];
  await page.route('https://cdn.paddle.com/**', async route => {
    requests.push(new URL(route.request().url()).hostname);
    await route.abort();
  });
  return requests;
}

async function expectNoticeFits(notice: Locator) {
  expect(
    await notice.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return (
        bounds.left >= 0 &&
        bounds.right <= window.innerWidth + 1 &&
        element.scrollWidth <= element.clientWidth + 1
      );
    })
  ).toBe(true);
}

test.describe('Truthful pricing with checkout closed', () => {
  test('keeps the localized closed notice and plan information accessible and responsive', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const paddleRequests = await watchPaddleRequests(page);
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      for (const { locale, plan, notice } of localeMatrix) {
        await page.setViewportSize({ width: 320, height: 844 });
        await gotoApp(page, `${routes.pricing(locale)}?plan=standard`, info, {
          marker: 'pricing-page-ready',
        });
        await page.waitForLoadState('load');

        const closedNotice = page.getByTestId('pricing-checkout-closed');
        const standardPlan = page.getByTestId('plan-card-standard');
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(standardPlan.getByRole('heading', { name: plan, exact: true })).toBeVisible();
        await expect(standardPlan.getByText('€20')).toBeVisible();
        await expect(page.getByTestId('plan-card-family')).toBeVisible();
        await expect(closedNotice).toHaveText(notice);
        await expect(closedNotice).toBeVisible();
        await expectNoticeFits(closedNotice);

        const calculator = page.getByTestId('pricing-success-fee-calculator');
        const calculatorOptions = calculator.locator('fieldset').getByRole('button');
        const standard = calculatorOptions.first();
        const family = calculatorOptions.last();
        await expect(calculatorOptions).toHaveCount(2);
        await expect(standard).toHaveAttribute('aria-pressed', 'true');
        await standard.focus();
        await page.keyboard.press('Tab');
        await expect(family).toBeFocused();
        await expect(family).toHaveAccessibleName(/\S/);
        expect((await family.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await family.press('Space');
        await expect(family).toHaveAttribute('aria-pressed', 'true');
        await expectNoCheckout(page);
        expect(paddleRequests).toEqual([]);

        if (locale === 'sq') {
          await page.setViewportSize({ width: 640, height: 900 });
          await page.locator('html').evaluate(element => {
            element.style.zoom = '2';
            element.style.letterSpacing = '0.12em';
            element.style.wordSpacing = '0.16em';
            element.style.lineHeight = '1.5';
          });
          await expect(page.locator('html')).toHaveCSS('zoom', '2');
          await expectNoticeFits(closedNotice);
        }
        await page.screenshot({
          path: info.outputPath(`pricing-closed-${locale}-${info.project.name}.png`),
          fullPage: true,
        });
      }
    });
  });

  test('renders plan and coverage information without JavaScript and claims no OTP success', async ({
    browser,
  }, info) => {
    const context = await browser.newContext({
      baseURL: info.project.use.baseURL,
      extraHTTPHeaders: info.project.use.extraHTTPHeaders,
      javaScriptEnabled: false,
      storageState: undefined,
    });
    const page = await context.newPage();
    try {
      const paddleRequests = await watchPaddleRequests(page);
      for (const { locale, notice } of localeMatrix) {
        await gotoApp(page, routes.pricing(locale), info, { marker: 'pricing-page-ready' });
        await page.waitForLoadState('load');
        await expect(page.getByTestId('plan-card-standard')).toBeVisible();
        await expect(page.getByTestId('plan-card-family')).toBeVisible();
        await expect(page.getByTestId('pricing-checkout-closed')).toHaveText(notice);
        await expect(page.getByTestId('pricing-commercial-disclaimers')).toBeVisible();
        await expect(page.getByTestId('pricing-billing-terms')).toBeVisible();
        await expect(page.getByTestId('pricing-coverage-matrix')).toBeVisible();
        await expectNoCheckout(page);
        await expect(page.getByRole('status')).toHaveCount(0);
        expect(paddleRequests).toEqual([]);
      }
      await page.screenshot({
        path: info.outputPath(`pricing-closed-no-js-${info.project.name}.png`),
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  });
});
