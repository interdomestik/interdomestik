import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { routes } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

async function expectNoOverflow(locator: Locator) {
  expect(await locator.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
}
// prettier-ignore
async function gotoOrigin(page: Page, url: URL, info: TestInfo, marker: string) { return gotoApp(page, url, { ...info, project: { ...info.project, use: { ...info.project.use, baseURL: url.origin } } } as TestInfo, { marker }); }
function watchRuntime(page: Page) {
  const failures: string[] = [];
  const sameOrigin = (url: string) =>
    page.url().startsWith('http') && new URL(url).origin === new URL(page.url()).origin;
  page.on('console', message => message.type() === 'error' && failures.push(message.text()));
  page.on('pageerror', error => failures.push(error.message));
  // prettier-ignore
  page.on('requestfailed', request => { const [error, headers, response, own] = [request.failure()?.errorText, request.headers(), request.existingResponse(), sameOrigin(request.url())]; const actionOk = request.method() === 'POST' && Boolean(headers['next-action']) && response?.ok() === true; const expected = own && error === 'net::ERR_ABORTED' && (headers['next-router-prefetch'] === '1' || actionOk); if (!expected && own) failures.push(`${request.method()} ${request.url()} failed: ${error ?? 'NA'}; action=${headers['next-action'] ?? '-'}; response=${response?.status() ?? '-'}`); });
  // prettier-ignore
  page.on('response', response => { if (sameOrigin(response.url()) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  return failures;
}
async function completePropertyPack(page: Page, info: TestInfo) {
  // prettier-ignore
  await page.addInitScript(() => { globalThis.localStorage.setItem('interdomestik_cookie_consent_v1', 'necessary'); document.cookie = 'cookie_consent=necessary; Path=/; SameSite=Lax'; });
  const baseURL = info.project.use.baseURL;
  if (!baseURL) throw new Error(`Expected a base URL for ${info.project.name}`);
  // prettier-ignore
  await page.context().addCookies([{ domain: new URL(baseURL.toString()).hostname, name: 'cookie_consent', path: '/', sameSite: 'Lax', value: 'necessary' }]);
  await gotoApp(page, routes.home('en'), info, { marker: 'free-start-intake-shell' });
  const organizer = page.getByTestId('premium-free-start-organizer');
  // prettier-ignore
  await (async () => { await organizer.getByTestId('free-start-category-property').click(); await organizer.getByRole('button', { name: 'Continue to guided intake' }).click(); await organizer.getByLabel('What happened?').selectOption('water_damage'); await organizer.getByLabel('When did it happen?').fill('2026-03-01'); await organizer.getByLabel('Who are you dealing with?').fill('Building insurer'); await organizer.getByLabel('What do you want to recover?').selectOption('repair'); await organizer.getByLabel('Brief summary').fill('Water damaged two rooms after a storm.'); await organizer.getByRole('button', { name: 'Review your summary' }).click(); await organizer.getByRole('button', { name: 'Create my summary' }).click(); })();
  await expect(page.getByTestId('claim-pack-result')).toBeVisible({ timeout: 15_000 });
  return organizer;
}

test.describe('premium Free Start result', () => {
  test('keeps the successful result trustworthy, operable, and reflowable', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const runtimeFailures = watchRuntime(page);
      await page.setViewportSize({ width: 390, height: 844 });
      const organizer = await completePropertyPack(page, info);
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      const complete = organizer.getByTestId('free-start-complete');
      const result = complete.getByTestId('claim-pack-result');
      // prettier-ignore
      const resultHeading = result.getByRole('heading', { name: 'Your temporary result is ready.' });

      // prettier-ignore
      await Promise.all([expect(complete).toHaveAttribute('data-layout', 'full-width'), expect(resultHeading).toBeVisible(), expect(result).toContainText('Photos of the property damage'), expect(result).toContainText('The generated result itself remains temporary and is not saved'), expect(result).not.toContainText(/human triage|Strong case|Photos showing the property/i), expect(result.getByRole('button', { name: 'Copy letter' })).toBeVisible(), expect(result.getByRole('button', { name: 'Download letter' })).toBeVisible(), expectNoOverflow(page.locator('html')), expectNoOverflow(result)]);

      // prettier-ignore
      for (const control of await result.getByRole('button').all()) { expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44); expect(await control.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16); }

      const primaryAction = result.getByRole('link');
      // prettier-ignore
      await (async () => { await primaryAction.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await expect(primaryAction).toBeFocused(); expect(await primaryAction.evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe('none'); await page.keyboard.press('Tab'); await expect(result.getByRole('button', { name: 'Copy letter' })).toBeFocused(); await page.keyboard.press('Tab'); await expect(result.getByRole('button', { name: 'Download letter' })).toBeFocused(); })();

      await page.setViewportSize({ width: 768, height: 900 });
      // prettier-ignore
      await page.locator('html').evaluate(element => { element.style.zoom = '2'; element.style.letterSpacing = '0.12em'; element.style.wordSpacing = '0.16em'; element.style.lineHeight = '1.5'; });
      await expect(resultHeading).toBeVisible();
      await expectNoOverflow(result);
      expect(runtimeFailures).toEqual([]);
    });

    // prettier-ignore
    const neutralUrl = new URL(info.project.use.baseURL?.toString() ?? 'http://ida.127.0.0.1.nip.io:3000');
    neutralUrl.hostname = neutralUrl.hostname.replace(/^[^.]+/, 'ida');
    // prettier-ignore
    const neutral = await browser.newContext({ extraHTTPHeaders: {}, storageState: undefined, viewport: { width: 390, height: 844 } });
    // prettier-ignore
    await neutral.addInitScript(() => { globalThis.localStorage.setItem('interdomestik_cookie_consent_v1', 'necessary'); document.cookie = 'cookie_consent=necessary; Path=/; SameSite=Lax'; });
    // prettier-ignore
    await neutral.addCookies([{ domain: neutralUrl.hostname, name: 'cookie_consent', path: '/', sameSite: 'Lax', value: 'necessary' }]);
    try {
      const page = await neutral.newPage();
      const neutralFailures = watchRuntime(page);
      for (const locale of ['sq', 'en', 'sr', 'mk']) {
        neutralUrl.pathname = routes.home(locale);
        await page.setViewportSize({ width: 320, height: 844 });
        await gotoOrigin(page, neutralUrl, info, 'free-start-intake-shell');
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expectNoOverflow(page.getByTestId('free-start-secure-save-band'));
      }
      neutralUrl.pathname = routes.home('en');
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoOrigin(page, neutralUrl, info, 'free-start-intake-shell');
      const band = page.getByTestId('free-start-secure-save-band');
      const save = band.getByTestId('free-start-save-open');
      // prettier-ignore
      await (async () => { await expect(band).toBeVisible(); await expect(band.getByRole('heading', { level: 3 })).toBeVisible(); await expect(band.getByRole('status')).toHaveAttribute('aria-atomic', 'true'); await save.focus(); await page.keyboard.press('Tab'); await expect(band.getByTestId('free-start-manage-open')).toBeFocused(); for (const button of await band.getByRole('button').all()) expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44); })();
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      for (const width of [320, 360, 390, 430, 1280, 1440]) {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
        await expectNoOverflow(band);
      }
      await page.setViewportSize({ width: 768, height: 900 });
      // prettier-ignore
      await page.locator('html').evaluate(node => { node.style.zoom = '2'; node.style.letterSpacing = '0.12em'; node.style.wordSpacing = '0.16em'; node.style.lineHeight = '1.5'; });
      await expectNoOverflow(band);
      await save.focus();
      await page.keyboard.press('Enter');
      // prettier-ignore
      await expect(band.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'unsupported');
      await page.getByTestId('free-start-category-property').click();
      // prettier-ignore
      await expect(band.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'idle');
      await save.focus();
      await page.keyboard.press('Enter');
      await expect(band.getByTestId('free-start-save-otp')).toBeVisible();
      const email = band.getByTestId('free-start-save-email');
      await band.getByTestId('free-start-save-send-code').click();
      await expect(email).toHaveAttribute('aria-describedby', /free-start-save-error/);
      // prettier-ignore
      await page.route('**/api/auth/email-otp/send-verification-otp', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
      await email.fill('ui03a1@example.test');
      await band.getByTestId('free-start-save-send-code').click();
      const code = band.getByTestId('free-start-save-code');
      await expect(code).toBeFocused();
      // prettier-ignore
      expect(await code.evaluate(node => { const box = node.getBoundingClientRect(); const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2); return hit === node || node.contains(hit); })).toBe(true);
      expect(neutralFailures).toEqual([]);
      await page.locator('html').evaluate(node => node.removeAttribute('style'));
      await page.setViewportSize({ width: 390, height: 844 });

      const unknown = new URL(neutralUrl);
      unknown.hostname = 'unknown.127.0.0.1.nip.io';
      await gotoOrigin(page, unknown, info, 'free-start-intake-shell');
      await expect(page.getByTestId('free-start-secure-save-band')).toHaveCount(0);
    } finally {
      await neutral.close();
    }

    const noJs = await browser.newContext({ javaScriptEnabled: false, storageState: undefined });
    try {
      const page = await noJs.newPage();
      await gotoOrigin(page, neutralUrl, info, 'free-start-trust-boundary');
      await expect(page.getByTestId('free-start-secure-save-band')).toHaveCount(0);
      // prettier-ignore
      await expect(page.getByTestId('free-start-trust-boundary')).toContainText(/not saved|no case/i);
    } finally {
      await noJs.close();
    }
  });
});
