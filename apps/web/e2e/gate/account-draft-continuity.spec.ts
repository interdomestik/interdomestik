import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import en from '../../src/messages/en/freeStart.json';
import sq from '../../src/messages/sq/freeStart.json';
import mk from '../../src/messages/mk/freeStart.json';
import sr from '../../src/messages/sr/freeStart.json';
import { gotoApp } from '../utils/navigation';
import { routes } from '../routes';
import { withFreshPage } from './test/login-handoff-page';
import {
  cleanupDraft,
  logout,
  neutralTarget,
  normalMemberLogin,
  runDrafts,
  sideEffects,
  unpaidOwner,
} from './test/account-draft-runtime';
const copies = { en, sq, mk, sr };
for (const surface of ['public', 'member'] as const) {
  for (const locale of ['en', 'sq', 'mk', 'sr'] as const) {
    test(`verified unpaid ${surface} ${locale} facts save and restore without OTP or Submit`, async ({
      browser,
    }, rawInfo) => {
      const info = neutralTarget(rawInfo);
      const context = await unpaidOwner();
      const baseline = await sideEffects(context);
      const summary = `Vehicle preparation ${randomUUID()}.`;
      const latest = `${summary} Newer supported facts.`;
      const ids = new Set<string>();
      let otpCalls = 0;
      const observeOtp = (page: Parameters<typeof gotoApp>[0]) => {
        page.context().on('request', request => {
          const url = new URL(request.url());
          if (
            url.origin === new URL(info.project.use.baseURL!).origin &&
            request.method() === 'POST' &&
            ['/api/auth/email-otp/send-verification-otp', '/api/auth/sign-in/email-otp'].includes(
              url.pathname
            )
          )
            otpCalls++;
        });
      };
      const open = async (page: Parameters<typeof gotoApp>[0]) => {
        await gotoApp(
          page,
          surface === 'public' ? `/${locale}` : `/${locale}/member/claims/new?mode=drafts`,
          info,
          { marker: surface === 'public' ? 'page-ready' : 'new-claim-page-ready' }
        );
        const shell = page.getByTestId(
          surface === 'public' ? 'free-start-intake-shell' : 'claim-draft-intake'
        );
        await expect(shell).toHaveCount(1);
        await expect(shell.getByTestId('account-draft-status')).toBeVisible();
        return shell;
      };
      try {
        await withFreshPage(browser, info, locale === 'sr', async page => {
          observeOtp(page);
          await normalMemberLogin(page, info, locale);
          const shell = await open(page);
          const category = shell.getByTestId(
            surface === 'public' ? 'free-start-category-vehicle' : 'claim-draft-category-vehicle'
          );
          await category.click();
          if (surface === 'member')
            await shell.getByTestId('claim-draft-category-continue').click();
          const field = shell.getByLabel(copies[locale].freeStart.details.summary);
          await expect(field).toBeEditable();
          expect(await runDrafts(context, summary)).toHaveLength(0);
          await field.fill(summary);
          await expect(shell.getByTestId('account-draft-status')).toHaveAttribute(
            'data-state',
            'saved'
          );
          await expect(field).toBeFocused();
          const first = await runDrafts(context, summary);
          expect(first).toHaveLength(1);
          ids.add(first[0]!.id);
          const version = first[0]!.version;
          await field.fill(latest);
          await expect(shell.getByTestId('account-draft-status')).toHaveAttribute(
            'data-state',
            'saved'
          );
          await expect(field).toBeFocused();
          await expect.poll(async () => (await runDrafts(context, latest)).length).toBe(1);
          const updated = await runDrafts(context, latest);
          expect(updated).toHaveLength(1);
          expect(updated[0]!.id).toBe(first[0]!.id);
          expect(updated[0]!.version).toBeGreaterThan(version);
          await expect(shell.getByTestId('account-draft-status')).toHaveAttribute(
            'data-state',
            'saved'
          );
          await expect(field).toBeFocused();
          await expect(shell.getByTestId('free-start-save-otp')).toHaveCount(0);
          expect(await page.evaluate(() => localStorage.length)).toBe(0);
          expect(await sideEffects(context)).toEqual(baseline);
          await page.reload();
          const restored = page.getByTestId(
            surface === 'public' ? 'free-start-intake-shell' : 'claim-draft-intake'
          );
          await expect(restored.getByLabel(copies[locale].freeStart.details.summary)).toHaveValue(
            latest
          );
          await logout(page, info, locale);
        });
        await withFreshPage(browser, info, locale === 'sr', async page => {
          observeOtp(page);
          await normalMemberLogin(page, info, locale);
          const shell = await open(page);
          await expect(shell.getByLabel(copies[locale].freeStart.details.summary)).toHaveValue(
            latest
          );
          await expect(shell.getByTestId('free-start-save-otp')).toHaveCount(0);
          expect(await sideEffects(context)).toEqual(baseline);
          await unpaidOwner();
          await logout(page, info, locale);
        });
        expect(otpCalls).toBe(0);
        rawInfo.annotations.push({
          type: 'account-draft-proof',
          description: JSON.stringify({
            surface,
            locale,
            verified: true,
            unpaidBeforeAfter: true,
            automaticSave: true,
            latestVersionRestore: true,
            secondContextRestore: true,
            focusPreserved: true,
            OTPCalls: otpCalls,
            submitted: false,
            caseMembershipLeadEffects: false,
            deviceStorageWritten: false,
          }),
        });
      } finally {
        for (const row of [
          ...(await runDrafts(context, summary)),
          ...(await runDrafts(context, latest)),
        ])
          ids.add(row.id);
        await cleanupDraft(context, ids);
      }
    });
  }
}

test('an account switch cannot adopt the previous editor facts or show its saved rows', async ({
  browser,
}, rawInfo) => {
  const info = neutralTarget(rawInfo);
  const ownerA = await unpaidOwner();
  const ownerB = await unpaidOwner(true);
  const summary = `Account privacy ${randomUUID()}.`;
  const ids = new Set<string>();
  try {
    await withFreshPage(browser, info, true, async page => {
      await normalMemberLogin(page, info, 'en');
      await gotoApp(page, routes.home('en'), info, { marker: 'page-ready' });
      const shell = page.getByTestId('free-start-intake-shell');
      await expect(shell.getByTestId('account-draft-status')).toBeVisible();
      await shell.getByTestId('free-start-category-vehicle').click();
      const field = shell.getByLabel(en.freeStart.details.summary);
      await field.fill(summary);
      await expect.poll(async () => (await runDrafts(ownerA, summary)).length).toBe(1);
      for (const row of await runDrafts(ownerA, summary)) ids.add(row.id);
      await expect(shell.getByTestId('account-draft-status')).toHaveAttribute(
        'data-state',
        'saved'
      );
      const peer = await page.context().newPage();
      try {
        await logout(peer, info, 'en');
        await normalMemberLogin(peer, info, 'en', true);
        // Same browser profile now authenticates B; authoritative Reload must never restore A.
        await page.reload();
        await expect(page.getByTestId('account-draft-status')).toBeVisible();
        const editor = page.getByTestId('free-start-intake-shell');
        await expect(editor.getByTestId('free-start-category-vehicle')).toBeVisible();
        await editor.getByTestId('free-start-category-vehicle').click();
        await expect(editor.getByLabel(en.freeStart.details.summary)).toHaveValue('');
        await expect(editor.getByTestId(`free-start-resume-${[...ids][0]}`)).toHaveCount(0);
        expect(await runDrafts(ownerB, summary)).toHaveLength(0);
        await unpaidOwner(true);
        await logout(peer, info, 'en');
      } finally {
        await peer.close();
      }
    });
    rawInfo.annotations.push({
      type: 'account-draft-privacy-proof',
      description: JSON.stringify({
        normalAccountSwitch: true,
        authoritativeReload: true,
        previousFactsAdopted: false,
        previousRowsRendered: false,
        unauthorizedWrite: false,
        staleWithoutRerender: 'covered by focused server/receipt tests, not this browser case',
      }),
    });
  } finally {
    for (const row of await runDrafts(ownerA, summary)) ids.add(row.id);
    await cleanupDraft(ownerA, ids);
  }
});
