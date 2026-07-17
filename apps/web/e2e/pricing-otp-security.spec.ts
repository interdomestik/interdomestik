import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { routes, type Locale } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';

const accountStop = {
  sq: /Kjo llogari nuk mund të vazhdojë/,
  en: /This account cannot continue/,
  sr: /Ovaj nalog ne može da nastavi/,
  mk: /Оваа сметка не може да продолжи/,
} as const;

async function enterOtpStep(page: Page, locale: Locale, info: TestInfo, keyboard = false) {
  await gotoApp(page, routes.pricing(locale), info, { marker: 'pricing-page-ready' });
  const cookieAccept = page.getByTestId('cookie-consent-accept');
  if (keyboard && (await cookieAccept.isVisible())) {
    await cookieAccept.focus();
    await cookieAccept.press('Space');
  }
  const activate = async (testId: string) => {
    const control = page.getByTestId(testId);
    if (keyboard) {
      await expect(control).toBeEnabled();
      await control.focus();
      await expect(control).toBeFocused();
      await control.press('Space');
    } else await control.click();
  };
  await activate('plan-cta-standard');
  await activate('precheckout-continue-cta');
  const email = page.getByTestId('pricing-otp-email-input');
  if (keyboard) {
    await email.focus();
    await expect(email).toBeFocused();
    await page.keyboard.type('member@example.com');
  } else await email.fill('member@example.com');
  await activate('pricing-otp-send-cta');
  const code = page.getByTestId('pricing-otp-code-input');
  if (keyboard) {
    await expect(code).toBeFocused();
    await page.keyboard.type('123456');
  } else await code.fill('123456');
  await activate('pricing-otp-verify-cta');
}

async function expectNoCheckoutContinuation(page: Page) {
  await page.waitForTimeout(1100);
  expect(page.url()).not.toContain('/member/membership/success');
  await expect(page.getByTestId('pricing-otp-verify-cta')).toBeDisabled();
}

test.describe('IDA-UI03a0b2 protected OTP journey', () => {
  test('C25 keeps SQ/EN account-stop localized, assertive and free of checkout continuation', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.route('**/api/auth/email-otp/send-verification-otp', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
      );
      await page.route('**/api/auth/sign-in/email-otp', route =>
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: '{"code":"ACCOUNT_STOP","message":"Unable to continue"}',
        })
      );
      for (const locale of ['sq', 'en'] as const) {
        await enterOtpStep(page, locale, info);
        const alert = page.locator('#pricing-otp-error');
        await expect(alert).toHaveAttribute('role', 'alert');
        await expect(alert).toHaveText(accountStop[locale]);
        await expectNoCheckoutContinuation(page);
      }
    });
  });

  test('C26 preserves SR/MK keyboard, forced-color, reduced-motion and 200% zoom semantics', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      await page.route('**/api/auth/email-otp/send-verification-otp', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
      );
      await page.route('**/api/auth/sign-in/email-otp', async route => {
        await page.waitForTimeout(500);
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: '{"code":"ACCOUNT_STOP","message":"Unable to continue"}',
        });
      });
      for (const locale of ['sr', 'mk'] as const) {
        await page.setViewportSize({ width: 640, height: 900 });
        await enterOtpStep(page, locale, info, true);
        const spinner = page.getByTestId('pricing-otp-verify-cta').locator('svg');
        await expect(spinner).toBeVisible();
        expect(await spinner.evaluate(element => getComputedStyle(element).animationName)).toBe(
          'none'
        );
        const alert = page.locator('#pricing-otp-error');
        await expect(alert).toHaveAttribute('role', 'alert');
        await expect(alert).toHaveText(accountStop[locale]);
        await expect(page.getByTestId('pricing-otp-code-input')).toBeFocused();
        await page.locator('html').evaluate(element => {
          element.style.zoom = '2';
          element.style.letterSpacing = '0.12em';
          element.style.wordSpacing = '0.16em';
          element.style.lineHeight = '1.5';
        });
        await page.addStyleTag({ content: 'p { margin-bottom: 2em !important; }' });
        await expectNoCheckoutContinuation(page);
        await expect(page.getByTestId('pricing-otp-step')).toBeVisible();
        const support = page.getByTestId('pricing-otp-step').getByRole('link');
        await expect(support).toBeVisible();
        expect(await support.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe(
          'none'
        );
        const overflow = await page.getByTestId('pricing-otp-step').evaluate(element => {
          const boundary = element.getBoundingClientRect();
          if (boundary.left < -1 || boundary.right > window.innerWidth + 1) {
            return [{ tag: element.tagName, id: element.id, testId: 'pricing-otp-step' }];
          }
          return [element, ...element.querySelectorAll<HTMLElement>('*')]
            .filter(candidate => {
              const rect = candidate.getBoundingClientRect();
              return rect.left < boundary.left - 1 || rect.right > boundary.right + 1;
            })
            .map(candidate => ({
              tag: candidate.tagName,
              id: candidate.id,
              testId: candidate.getAttribute('data-testid'),
              text: candidate.textContent?.trim().slice(0, 80),
            }));
        });
        expect(overflow).toEqual([]);
      }
    });
  });
});
