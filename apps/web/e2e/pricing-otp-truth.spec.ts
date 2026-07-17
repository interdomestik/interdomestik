import { expect, test, type Page } from '@playwright/test';

import { routes, type Locale } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';

const localeMatrix = [
  {
    locale: 'sq',
    heading: 'Konfirmoni email-in për të vazhduar',
    truth: /Nuk konfirmon pagesë, anëtarësi aktive, kërkesë për dëm apo rast të pranuar/,
    email: 'Adresa e email-it',
  },
  {
    locale: 'en',
    heading: 'Confirm your email to continue',
    truth: /does not confirm payment, active membership, a claim, or an accepted case/,
    email: 'Email',
  },
  {
    locale: 'sr',
    heading: 'Potvrdite e-adresu da nastavite',
    truth: /Ne potvrđuje uplatu, aktivno članstvo, zahtev niti prihvaćen predmet/,
    email: 'Adresa e-pošte',
  },
  {
    locale: 'mk',
    heading: 'Потврдете ја е-поштата за да продолжите',
    truth: /Не потврдува плаќање, активно членство, барање за надомест или прифатен случај/,
    email: 'Е-пошта',
  },
] as const;

async function expectNoOtpOverflow(page: Page) {
  expect(
    await page
      .getByTestId('pricing-otp-step')
      .evaluate(element => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true);
}

test.describe('IDA-UI03a0b1 neutral OTP truth', () => {
  test('keeps the deliberate OTP boundary truthful, accessible, and responsive', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      for (const entry of localeMatrix) {
        await page.setViewportSize({ width: 320, height: 844 });
        await gotoApp(page, routes.pricing(entry.locale), info, { marker: 'pricing-page-ready' });
        await page.getByTestId('plan-cta-standard').click();
        await page.getByTestId('precheckout-continue-cta').click();

        const step = page.getByTestId('pricing-otp-step');
        const heading = step.getByRole('heading', { name: entry.heading });
        const email = step.getByLabel(entry.email);
        const code = step.getByTestId('pricing-otp-code-input');
        await expect(heading).toBeFocused();
        await expect(step.getByText(entry.truth)).toBeVisible();
        await expect(email).toHaveAttribute('autocomplete', 'email');
        await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
        await expect(code).toHaveAttribute('inputmode', 'numeric');
        await expect(code).toBeDisabled();
        expect(
          (await step.getByTestId('pricing-otp-send-cta').boundingBox())?.height
        ).toBeGreaterThanOrEqual(44);
        await expectNoOtpOverflow(page);
        await heading.press('Tab');
        await expect(email).toBeFocused();

        if (entry.locale === 'sq') {
          await page.setViewportSize({ width: 640, height: 900 });
          await page.locator('html').evaluate(element => {
            element.style.zoom = '2';
            element.style.letterSpacing = '0.12em';
            element.style.wordSpacing = '0.16em';
            element.style.lineHeight = '1.5';
          });
          await expectNoOtpOverflow(page);
        }
        await page.screenshot({
          path: info.outputPath(`otp-${entry.locale}-${info.project.name}.png`),
          fullPage: true,
        });
      }
    });
  });

  test('renders pricing truth without JavaScript and claims no OTP success', async ({
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
      for (const locale of ['sq', 'en', 'sr', 'mk'] as Locale[]) {
        await gotoApp(page, routes.pricing(locale), info, { marker: 'pricing-page-ready' });
        await expect(page.getByTestId('pricing-commercial-disclaimers')).toBeVisible();
        await expect(page.getByTestId('pricing-billing-terms')).toBeVisible();
        await expect(page.getByTestId('pricing-coverage-matrix')).toBeVisible();
        await expect(page.getByTestId('pricing-otp-step')).toHaveCount(0);
        await expect(page.getByTestId('pricing-otp-send-cta')).toHaveCount(0);
        await expect(page.getByRole('status')).toHaveCount(0);
      }
      await page.screenshot({
        path: info.outputPath(`otp-no-js-${info.project.name}.png`),
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  });
});
