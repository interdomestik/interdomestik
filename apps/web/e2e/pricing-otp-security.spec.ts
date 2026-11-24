import { expect, test, type Page } from '@playwright/test';

import { routes } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';

const closedNotice = {
  sq: 'Blerja e anëtarësive është përkohësisht e mbyllur.',
  en: 'Membership purchases are currently closed.',
  sr: 'Kupovina članstva trenutno je zatvorena.',
  mk: 'Купувањето членство моментално е затворено.',
} as const;
const sendPath = '/api/auth/email-otp/send-verification-otp';
const verifyPath = '/api/auth/sign-in/email-otp';
const textSpacing = 'html{zoom:2;letter-spacing:.12em;word-spacing:.16em;line-height:1.5}';
const memberSession = {
  session: { id: 's', userId: 'u' },
  user: { id: 'u', email: 'member@example.test' },
};

function getIdaOrigin(): string {
  const configured = process.env.IDA_HOST ?? 'ida.localhost:3000';
  return new URL(configured.includes('://') ? configured : `http://${configured}`).origin;
}

async function watchCheckoutRequests(page: Page) {
  const requests: string[] = [];
  await page.route(
    url => url.hostname === 'cdn.paddle.com' || [sendPath, verifyPath].includes(url.pathname),
    async route => {
      requests.push(new URL(route.request().url()).pathname);
      await route.abort();
    }
  );
  return requests;
}

async function expectClosedPricing(page: Page) {
  await expect(page.getByTestId('plan-card-standard')).toBeVisible();
  await expect(page.getByTestId('plan-card-family')).toBeVisible();
  await expect(page.getByTestId('pricing-checkout-closed')).toBeVisible();
  await expect(page.getByTestId(/^plan-cta-/)).toHaveCount(0);
  await expect(page.getByTestId('pricing-precheckout-confirmation')).toHaveCount(0);
  await expect(page.getByTestId('precheckout-continue-cta')).toHaveCount(0);
  await expect(page.getByTestId(/^pricing-otp-/)).toHaveCount(0);
  await expect(page.locator('script[src*="paddle.com"]')).toHaveCount(0);
  await expect(page).not.toHaveURL(/\/member\/membership\/success/);
}

test.describe('Closed pricing and the door OTP boundary', () => {
  test('C25 explains the closure in SQ and EN without an OTP challenge or continuation', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const checkoutRequests = await watchCheckoutRequests(page);
      for (const locale of ['sq', 'en'] as const) {
        await gotoApp(page, `${routes.pricing(locale)}?plan=standard`, info, {
          marker: 'pricing-page-ready',
        });
        await page.waitForLoadState('load');

        await expectClosedPricing(page);
        await expect(page.getByTestId('pricing-checkout-closed')).toHaveText(closedNotice[locale]);
        await expect(page.locator('#pricing-otp-error')).toHaveCount(0);
        expect(checkoutRequests).toEqual([]);
      }
    });
  });

  test('C26 keeps SR and MK pricing usable by keyboard with forced colors and zoom', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const checkoutRequests = await watchCheckoutRequests(page);
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 640, height: 900 });
      for (const locale of ['sr', 'mk'] as const) {
        await gotoApp(page, `${routes.pricing(locale)}?plan=standard`, info, {
          marker: 'pricing-page-ready',
        });
        await page.waitForLoadState('load');

        expect(
          await page.evaluate(() => ({
            forcedColors: matchMedia('(forced-colors: active)').matches,
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          }))
        ).toEqual({ forcedColors: true, reducedMotion: true });

        await page.addStyleTag({ content: textSpacing });
        await expect(page.locator('html')).toHaveCSS('zoom', '2');
        const notice = page.getByTestId('pricing-checkout-closed');
        await expect(notice).toHaveText(closedNotice[locale]);
        expect(
          await notice.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            return (
              bounds.left >= 0 &&
              bounds.right <= innerWidth + 1 &&
              element.scrollWidth <= element.clientWidth + 1
            );
          })
        ).toBe(true);

        const options = page
          .getByTestId('pricing-success-fee-calculator')
          .locator('fieldset')
          .getByRole('button');
        const cookieDecline = page.getByTestId('cookie-consent-decline');
        if (await cookieDecline.isVisible()) {
          await cookieDecline.press('Space');
          await expect(cookieDecline).toHaveCount(0);
        }
        await expect(options).toHaveCount(2);
        const family = options.last();
        await options.first().focus();
        await page.keyboard.press('Tab');
        await expect(family).toBeEnabled();
        await expect(family).toBeFocused();
        expect(await family.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe(
          'none'
        );
        await family.press('Space');
        await expect(family).toHaveAttribute('aria-pressed', 'true');

        await expectClosedPricing(page);
        await expect(page.locator('#pricing-otp-error')).toHaveCount(0);
        expect(checkoutRequests).toEqual([]);
      }
    });
  });

  test('C32 keeps tenant pricing on its own origin and the IDA preview isolated', async ({
    browser,
  }, info) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const tenantPage = await context.newPage();
      const idaPage = await context.newPage();
      const tenantOrigin = new URL(String(info.project.use.baseURL)).origin;
      const idaOrigin = getIdaOrigin();
      expect(tenantOrigin).not.toBe(idaOrigin);
      const tenantCheckoutRequests = await watchCheckoutRequests(tenantPage);
      const idaCheckoutRequests = await watchCheckoutRequests(idaPage);
      const automaticIdaRequests: string[] = [];
      const idaDocuments: string[] = [];

      tenantPage.on('request', request => {
        const url = new URL(request.url());
        if (url.origin === idaOrigin) automaticIdaRequests.push(url.pathname);
      });
      idaPage.on('request', request => {
        if (request.resourceType() === 'document') idaDocuments.push(request.url());
      });

      await context.addCookies([{ name: 'tenant-only', value: '1', url: tenantOrigin }]);
      const locales = ['sq', 'en', 'sr', 'mk', 'de'] as const;
      for (const locale of locales) {
        const path = `${routes.pricing(locale)}?plan=standard`;
        await gotoApp(tenantPage, path, info, { marker: 'pricing-page-ready' });
        await tenantPage.waitForLoadState('load');
        await expect(tenantPage).toHaveURL(`${tenantOrigin}${path}`);
        await expectClosedPricing(tenantPage);
        expect(await tenantPage.evaluate(() => document.cookie.includes('tenant-only=1'))).toBe(
          true
        );

        const response = await gotoApp(idaPage, path, info, {
          baseURL: idaOrigin,
          marker: 'pricing-page-ready',
        });
        expect(response?.ok()).toBe(true);
        await idaPage.waitForLoadState('load');
        await expect(idaPage).toHaveURL(`${idaOrigin}${path}`);
        await expectClosedPricing(idaPage);
        expect(await idaPage.evaluate(() => document.cookie.includes('tenant-only=1'))).toBe(false);
        const headers = await response?.request().allHeaders();
        expect(headers?.cookie?.includes('tenant-only=1') ?? false).toBe(false);
        expect(Boolean(headers?.referer)).toBe(false);
      }
      expect(idaDocuments).toEqual(
        locales.map(locale => `${idaOrigin}${routes.pricing(locale)}?plan=standard`)
      );

      const tamperedPath = `${routes.pricing('sq')}?plan=business&tenantId=tenant_mk#private`;
      await gotoApp(idaPage, tamperedPath, info, {
        baseURL: idaOrigin,
        marker: 'pricing-page-ready',
      });
      await idaPage.waitForLoadState('load');
      await expect(idaPage).toHaveURL(`${idaOrigin}${tamperedPath}`);
      await expectClosedPricing(idaPage);
      await expect(idaPage.locator('[data-selected-plan="1"]')).toHaveCount(0);

      await idaPage.route('**/api/auth/get-session', route =>
        route.fulfill({ json: memberSession })
      );
      const memberPath = `${routes.pricing('sq')}?plan=family`;
      await Promise.all([
        idaPage.waitForResponse(`${idaOrigin}/api/auth/get-session`),
        gotoApp(idaPage, memberPath, info, { baseURL: idaOrigin, marker: 'pricing-page-ready' }),
      ]);
      await idaPage.waitForLoadState('load');
      await expect(idaPage).toHaveURL(`${idaOrigin}${memberPath}`);
      await expectClosedPricing(idaPage);
      await expect(idaPage.getByTestId('plan-card-family')).toHaveAttribute(
        'data-selected-plan',
        '0'
      );
      expect(automaticIdaRequests).toEqual([]);
      expect(tenantCheckoutRequests).toEqual([]);
      expect(idaCheckoutRequests).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('door OTP send and verify still refuse tenant hosts and cross-origin requests', async ({
    browser,
  }, info) => {
    const tenantOrigin = new URL(String(info.project.use.baseURL)).origin;
    const idaOrigin = getIdaOrigin();
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const email = 'not-an-account@example.test';
      const cases = [
        { path: sendPath, data: { email, type: 'sign-in' } },
        {
          path: verifyPath,
          data: {
            email,
            otp: '000000',
            onboarding: {
              mode: 'deferred',
              tenant: process.env.DEFAULT_PUBLIC_TENANT_ID ?? 'tenant_ks',
            },
          },
        },
      ];
      for (const { path, data } of cases) {
        for (const [targetOrigin, status] of [
          [tenantOrigin, 400],
          [idaOrigin, 403],
        ] as const) {
          const response = await context.request.post(new URL(path, targetOrigin).toString(), {
            data,
            headers: { Origin: tenantOrigin },
            maxRedirects: 0,
          });
          expect(response.status()).toBe(status);
          expect(await response.json()).toEqual({
            code: 'OTP_UNAVAILABLE',
            message: 'Unable to verify',
          });
          expect(Boolean(response.headers()['set-cookie'])).toBe(false);
        }
      }
      expect(await context.cookies()).toHaveLength(0);
    } finally {
      await context.close();
    }
  });
});
