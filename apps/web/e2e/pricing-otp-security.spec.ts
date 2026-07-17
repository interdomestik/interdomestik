import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import { routes, type Locale } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';
const accountStop = {
  sq: /Kjo llogari nuk mund të vazhdojë/,
  en: /This account cannot continue/,
  sr: /Ovaj nalog ne može da nastavi/,
  mk: /Оваа сметка не може да продолжи/,
} as const;
const sendOk = (route: Route) => route.fulfill({ json: { success: true } });
const stopAccount = (r: Route) => r.fulfill({ status: 409, json: { code: 'ACCOUNT_STOP' } });
const TEXT_SPACING_CSS =
  'html{zoom:2;letter-spacing:.12em;word-spacing:.16em;line-height:1.5}p{margin-bottom:2em!important}';
const MEMBER_SESSION = '{"session":{"id":"s","userId":"u"},"user":{"id":"u","email":"m@e.co"}}';
const localOrigin = (v: string) => new URL(v.includes('://') ? v : `http://${v}`).origin;
const C25 = 'C25 keeps SQ/EN account-stop localized, assertive and free of checkout continuation';
const C26 = 'C26 preserves SR/MK keyboard, forced-color, reduced-motion and 200% zoom semantics';
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
async function expectAccountStop(page: Page, locale: keyof typeof accountStop) {
  const alert = page.locator('#pricing-otp-error');
  await expect(alert).toHaveAttribute('role', 'alert');
  await expect(alert).toHaveText(accountStop[locale]);
  await expect(page.getByTestId('pricing-otp-verify-cta')).toBeDisabled();
  await expect(page).not.toHaveURL(/\/member\/membership\/success/);
}
test.describe('IDA-UI03a0b2 protected OTP journey', () => {
  test(C25, async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.route('**/api/auth/email-otp/send-verification-otp', sendOk);
      await page.route('**/api/auth/sign-in/email-otp', stopAccount);
      for (const locale of ['sq', 'en'] as const) {
        await enterOtpStep(page, locale, info);
        await expectAccountStop(page, locale);
      }
    });
  });
  test(C26, async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      await page.route('**/api/auth/email-otp/send-verification-otp', sendOk);
      let pendingVerify: Route | null = null;
      await page.route('**/api/auth/sign-in/email-otp', route => {
        pendingVerify = route;
      });
      for (const locale of ['sr', 'mk'] as const) {
        pendingVerify = null;
        await page.setViewportSize({ width: 640, height: 900 });
        await enterOtpStep(page, locale, info, true);
        const spinner = page.getByTestId('pricing-otp-verify-cta').locator('svg');
        await expect(spinner).toBeVisible();
        await expect.poll(() => pendingVerify !== null).toBe(true);
        expect(await spinner.evaluate(e => getComputedStyle(e).animationName)).toBe('none');
        await stopAccount(pendingVerify!);
        await expectAccountStop(page, locale);
        await expect(page.getByTestId('pricing-otp-code-input')).toBeFocused();
        await page.addStyleTag({ content: TEXT_SPACING_CSS });
        await expect(page.getByTestId('pricing-otp-step')).toBeVisible();
        const support = page.getByTestId('pricing-otp-step').getByRole('link');
        await expect(support).toBeVisible();
        expect(await support.evaluate(e => getComputedStyle(e).outlineStyle)).not.toBe('none');
        const overflow = await page.getByTestId('pricing-otp-step').evaluate(element => {
          const boundary = element.getBoundingClientRect();
          if (boundary.left < -1 || boundary.right > window.innerWidth + 1) return true;
          return [...element.querySelectorAll<HTMLElement>('*')].some(candidate => {
            const rect = candidate.getBoundingClientRect();
            return rect.left < boundary.left - 1 || rect.right > boundary.right + 1;
          });
        });
        expect(overflow).toBe(false);
      }
    });
  });
  test('C32 isolates deliberate tenant-to-IDA navigation', async ({ browser }, info) => {
    const page = await browser.newPage({ baseURL: info.project.use.baseURL });
    const tenantOrigin = new URL(String(info.project.use.baseURL)).origin;
    const idaOrigin = localOrigin(process.env.IDA_HOST ?? 'ida.localhost:3000');
    const [docs, preIda] = [[], []] as [string[], string[]];
    let awaitingIdaDocument = false;
    page.on('request', request => {
      const isIda = request.url().startsWith(idaOrigin);
      if (request.resourceType() === 'document' && isIda) {
        awaitingIdaDocument = false;
        docs.push(`${request.url()}|${request.headers().referer}`);
      } else if (isIda && awaitingIdaDocument) {
        preIda.push(request.resourceType());
      }
    });
    await page.context().addCookies([{ name: 'tenant-only', value: '1', url: tenantOrigin }]);
    for (const locale of ['sq', 'en', 'sr', 'mk'] as const) {
      await page.goto(`${tenantOrigin}/${locale}/pricing`, { waitUntil: 'domcontentloaded' });
      awaitingIdaDocument = true;
      await page.getByTestId('plan-cta-standard').click();
      await page.getByTestId('precheckout-continue-cta').click();
      await expect(page).toHaveURL(`${idaOrigin}/${locale}/pricing`);
      await expect(page.locator('#pricing-otp-heading')).toBeFocused();
      expect(await page.evaluate(() => document.cookie)).not.toContain('tenant-only=1');
    }
    expect(docs).toEqual(
      ['sq', 'en', 'sr', 'mk'].map(
        locale => `${idaOrigin}/${locale}/pricing?plan=standard|${tenantOrigin}/`
      )
    );
    expect(preIda).toEqual([]);
    const sqPricing = `${idaOrigin}${routes.pricing('sq')}`;
    await page.goto(`${sqPricing}?plan=business&tenantId=tenant_mk#private`);
    await expect(page).toHaveURL(sqPricing);
    await expect(page.getByTestId('pricing-otp-step')).toHaveCount(0);
    await page.route('**/api/auth/get-session', route =>
      route.fulfill({ contentType: 'application/json', body: MEMBER_SESSION })
    );
    await page.goto(`${sqPricing}?plan=family`);
    await expect(page).toHaveURL(sqPricing);
    await expect(page.getByTestId('plan-card-family')).toHaveAttribute('data-selected-plan', '1');
    await expect(page.getByTestId('pricing-otp-step')).toHaveCount(0);
    await page.context().close();
  });
});
