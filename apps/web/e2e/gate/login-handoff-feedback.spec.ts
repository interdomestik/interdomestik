import { E2E_PASSWORD } from '@interdomestik/database';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { gotoApp } from '../utils/navigation';
import { interactiveLogin, normalLogout, withFreshPage } from './test/login-handoff-page';
import { heldLogin } from './test/login-handoff-session';
import { passiveRoleObserver } from './test/login-handoff-observer';
import {
  withIsolatedExpiry,
  isolatedExpiryAdditionalTimeoutMs,
  type OwnedExpiryFixture,
} from './test/login-handoff-isolated-expiry';
import { expireOwnedSession } from './test/login-handoff-expiry';

const locales = ['en', 'sq', 'mk', 'sr'] as const;
const sessionCacheSettleMs = 2100; // Existing server session cache TTL is 2s; fixture-only settling.

test.describe('Login handoff feedback continuity', () => {
  for (const locale of locales) {
    test(`verified ${locale} member handoff stays busy until the real document commits`, async ({
      browser,
    }, info) => {
      await withFreshPage(browser, info, locale === 'sr', async page => {
        const actualPageShows: boolean[] = [];
        if (locale === 'en') {
          await page.exposeBinding('__observeActualBackPageShow', (source, persisted: boolean) => {
            if (
              source.frame === page.mainFrame() &&
              typeof persisted === 'boolean' &&
              actualPageShows.length < 20
            )
              actualPageShows.push(persisted);
          });
          await page.addInitScript(() => {
            window.addEventListener('pageshow', event => {
              const owner = window as unknown as {
                __observeActualBackPageShow: (value: boolean) => Promise<void>;
              };
              void owner.__observeActualBackPageShow(event.persisted).catch(() => {});
            });
          });
        }
        const login = await heldLogin(page, info, locale);
        await login.release();
        await expect(page).toHaveURL(new RegExp(`/${locale}/member(?:\\?|$)`));
        await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();
        if (locale === 'en') {
          await expect.poll(() => actualPageShows.length >= 2).toBe(true);
          const beforeBack = actualPageShows.length;
          const response = await page.goBack();
          await expect.poll(() => actualPageShows.length > beforeBack).toBe(true);
          info.annotations.push({
            type: 'actual-back-observation',
            description: JSON.stringify({
              responsePresent: response !== null,
              pageshowPersisted: actualPageShows.slice(beforeBack),
              synthetic: false,
              BFCacheProof: false,
              browserCondition: 'unmodified Playwright Chromium launch',
            }),
          });
          await page.reload();
          await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();
          expect(login.passwordPostCount()).toBe(1);
        }
        await normalLogout(page, locale);
        await login.close();
      });
    });
  }

  test('verified administrator keeps the same handoff and canonical target', async ({
    browser,
  }, info) => {
    await withFreshPage(browser, info, false, async page => {
      const locale = info.project.name.includes('mk') ? 'mk' : 'sq';
      const login = await heldLogin(page, info, locale, true);
      await login.release();
      await expect(page).toHaveURL(new RegExp(`/${locale}/admin/overview(?:\\?|$)`));
      await expect(page.getByTestId('admin-page-ready')).toBeVisible();
      await normalLogout(page, locale);
      await login.close();
    });
  });

  for (const state of ['valid', 'absent', 'expired-server'] as const) {
    test(`interrupted handoff Reload re-verifies a ${state} session without credential replay`, async ({
      browser,
    }, info) => {
      // This case alone may migrate and seed the empty owned spare (60s each).
      if (state === 'expired-server') {
        const scenarioTimeoutMs = info.timeout;
        const totalTimeoutMs = scenarioTimeoutMs + isolatedExpiryAdditionalTimeoutMs;
        test.setTimeout(totalTimeoutMs);
        info.annotations.push({
          type: 'isolated-expiry-budget',
          description: JSON.stringify({
            scenarioTimeoutMs,
            additionalFixtureTimeoutMs: isolatedExpiryAdditionalTimeoutMs,
            totalTimeoutMs,
          }),
        });
      }
      const run = async (
        page: Page,
        fixture?: OwnedExpiryFixture,
        currentInfo: TestInfo = info
      ) => {
        const locale = info.project.name.includes('mk') ? 'mk' : 'sq';
        const login = await heldLogin(page, currentInfo, locale);
        let restore: (() => Promise<boolean>) | undefined;
        try {
          await login.stop();
          await interactiveLogin(page, locale);
          await expect(page.getByTestId('login-submit')).toBeEnabled();
          if (state === 'absent') {
            const peer = await page.context().newPage();
            try {
              await gotoApp(peer, login.target, currentInfo, { marker: 'member-dashboard-ready' });
              await expect(peer.getByTestId('member-dashboard-ready')).toBeVisible();
              await normalLogout(peer, locale);
            } finally {
              await peer.close();
            }
            await page.context().clearCookies();
          }
          if (state === 'expired-server') restore = await expireOwnedSession(page, login, fixture);
          await page.waitForTimeout(sessionCacheSettleMs);
          await page.reload();
          expect(login.passwordPostCount()).toBe(1);
          if (state === 'valid') {
            await expect(page).toHaveURL(new RegExp(`/${locale}/member(?:\\?|$)`));
            await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();
            await normalLogout(page, locale);
          } else {
            await interactiveLogin(page, locale);
          }
        } finally {
          await login.release();
          const restored = restore ? await restore() : false;
          if (restore) {
            info.annotations.push({
              type: 'owned-expiry-cleanup',
              description: JSON.stringify({ rowRestored: restored, rowAlreadyRemoved: !restored }),
            });
          }
          if (restored) {
            await page.waitForTimeout(sessionCacheSettleMs);
            await gotoApp(page, login.target, currentInfo, { marker: 'member-dashboard-ready' });
            await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();
            await normalLogout(page, locale);
          }
          expect(login.passwordPostCount()).toBe(1);
          await login.close();
        }
      };
      if (state === 'expired-server') await withIsolatedExpiry(browser, info, run);
      else await withFreshPage(browser, info, true, page => run(page));
    });
  }

  test('actual browser Stop releases only the canceled handoff for one same-form normal retry', async ({
    browser,
  }, info) => {
    await withFreshPage(browser, info, true, async page => {
      const locale = info.project.name.includes('mk') ? 'mk' : 'sq';
      const login = await heldLogin(page, info, locale);
      await login.stop();
      await interactiveLogin(page, locale);
      await expect(page.getByTestId('login-submit')).toBeEnabled();
      expect(login.passwordPostCount()).toBe(1);
      const role = await passiveRoleObserver(
        page,
        new URL(page.url()).origin,
        login.identity.dbRole,
        false
      );
      try {
        await page.getByTestId('login-email').fill(login.identity.email);
        await page.getByTestId('login-password').fill(E2E_PASSWORD);
        const password = page.waitForResponse(
          response =>
            new URL(response.url()).pathname === '/api/auth/sign-in/email' &&
            response.request().method() === 'POST'
        );
        await page.getByTestId('login-submit').click();
        expect((await password).status()).toBe(200);
        await expect(page).toHaveURL(new RegExp(String.raw`/${locale}/member(?:\?|$)`));
        await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();
        await expect.poll(() => role.read() !== null).toBe(true);
        expect(role.read()?.status === 200 && role.read()?.bodyRead && role.read()?.validated).toBe(
          true
        );
        expect(login.passwordPostCount()).toBe(2);
        expect(login.roleGetCount()).toBe(2);
        info.annotations.push({
          type: 'same-form-cancellation-retry',
          description: JSON.stringify({
            actualBrowserStop: true,
            nativeEscapeProven: false,
            explicitRetry: true,
            passwordPosts: 2,
            validatedRole: true,
            memberReady: true,
          }),
        });
        await normalLogout(page, locale);
      } finally {
        await role.close();
        await login.close();
      }
    });
  });

  test('synthetic persisted restoration resets a completed handoff only; it is not BFCache evidence', async ({
    browser,
  }, info) => {
    await withFreshPage(browser, info, true, async page => {
      // Compatibility simulation only; this is not an older-browser or BFCache claim.
      await page.addInitScript(() =>
        Object.defineProperty(window, 'navigation', { value: undefined })
      );
      info.annotations.push({
        type: 'synthetic-restoration-fallback',
        description: JSON.stringify({
          simulatedUnsupportedNavigationAPI: true,
          syntheticPersisted: true,
          actualBFCacheProof: false,
        }),
      });
      const locale = info.project.name.includes('mk') ? 'mk' : 'sq';
      const login = await heldLogin(page, info, locale);
      await login.stop();
      await page.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }))
      );
      await expect(page.getByTestId('login-submit')).toBeDisabled();
      await page.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      );
      await expect(page.getByTestId('login-email')).toBeEditable();
      await expect(page.getByTestId('login-submit')).toBeEnabled();
      await page.reload();
      await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();
      await normalLogout(page, locale);
      await login.close();
    });
  });
});
