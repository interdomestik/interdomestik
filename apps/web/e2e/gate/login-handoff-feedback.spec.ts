import { expect, test } from '@playwright/test';
import { gotoApp } from '../utils/navigation';
import { interactiveLogin, normalLogout, withFreshPage } from './test/login-handoff-page';
import { heldLogin } from './test/login-handoff-session';
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
      await withFreshPage(browser, info, true, async page => {
        const locale = info.project.name.includes('mk') ? 'mk' : 'sq';
        const login = await heldLogin(page, info, locale);
        let restore: (() => Promise<boolean>) | undefined;
        try {
          await login.stop();
          await expect(page.getByTestId('login-submit')).toBeDisabled();
          if (state === 'absent') {
            const peer = await page.context().newPage();
            try {
              await gotoApp(peer, login.target, info, { marker: 'member-dashboard-ready' });
              await expect(peer.getByTestId('member-dashboard-ready')).toBeVisible();
              await normalLogout(peer, locale);
            } finally {
              await peer.close();
            }
            await page.context().clearCookies();
          }
          if (state === 'expired-server') restore = await expireOwnedSession(page, login);
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
            await gotoApp(page, login.target, info, { marker: 'member-dashboard-ready' });
            await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();
            await normalLogout(page, locale);
          }
          expect(login.passwordPostCount()).toBe(1);
          await login.close();
        }
      });
    });
  }

  test('synthetic persisted restoration resets a completed handoff only; it is not BFCache evidence', async ({
    browser,
  }, info) => {
    await withFreshPage(browser, info, true, async page => {
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
