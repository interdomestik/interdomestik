import { e2eEmail } from '@interdomestik/database';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { getProjectUrlInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import {
  changeIntake,
  login,
  mailIds,
  navigateToPilotSettings,
  persistedOwner,
  pilotHeaders,
  tenantId,
  withRecoveryAccount,
} from './different-email-recovery.fixture';
import {
  deleteMail,
  enter,
  mailboxConfigured,
  redact,
  waitForOtpMail,
  type OtpMail,
} from './s5-otp-mailbox.fixture';
import { idaOrigin, idaTarget } from './s5-saved-draft.fixture';

const emptyStorage = { cookies: [], origins: [] };
const recoveryHeading = /different email|email tjetër|e-adresu|е-пошта/i;

// The server-action requests include one-time codes. Keep them out of retained artifacts.
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

function requireMailbox() {
  if (process.env.E2E_OTP_PROOF_REQUIRED === '1') {
    expect(mailboxConfigured(), 'the required lane provides the mail catcher').toBe(true);
  }
  test.skip(!mailboxConfigured(), 'Needs the loopback mail catcher.');
}

async function mountRecovery(
  page: Page,
  info: ReturnType<typeof idaTarget>,
  owner: { id: string; email: string }
) {
  await gotoApp(page, routes.home('en'), info, { marker: 'free-start-intake-shell' });
  const organizer = page.getByTestId('premium-free-start-organizer');
  await expect(organizer).toBeVisible();
  await organizer.getByTestId('free-start-save-entry-manage').click();
  await expect(organizer.getByTestId('free-start-secure-save-band')).toBeVisible();
  await login(page, idaOrigin(info), owner);
  await organizer.getByTestId('free-start-manage-open').click();
  await expect(
    organizer.getByRole('heading', { name: /your saved drafts|draftet e ruajtura/i })
  ).toBeFocused({ timeout: 20_000 });
  const entry = organizer.getByTestId('different-email-recovery-open');
  await expect(entry).toBeVisible();
  expect((await entry.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await entry.focus();
  await page.keyboard.press('Enter');

  const recovery = organizer.getByTestId('different-email-recovery');
  await expect(recovery.getByRole('heading', { name: recoveryHeading })).toBeFocused();
  return recovery;
}

async function enterCurrentProof(
  recovery: Locator,
  email: string,
  replacement: string,
  seen: Set<string>,
  mails: OtpMail[]
) {
  await recovery.getByRole('button', { name: 'Send code to original email' }).click();
  await expect(recovery.getByRole('heading', { name: 'Verify original email' })).toBeFocused();
  const mail = await waitForOtpMail(email, seen);
  mails.push(mail);
  expect(mail.to).toBe(email);
  expect(mail.subject).toBe('Confirm your original email');
  await enter(recovery.getByLabel('Verification code'), mail.code);
  await recovery.getByLabel('New email').fill(replacement);
}

test.describe('IDA-UI03b different-email recovery', () => {
  test.describe.configure({ mode: 'default' });

  test('refuses a verified manager submission after public intake closes', async ({
    browser,
  }, rawInfo) => {
    test.skip(
      rawInfo.project.name !== 'gate-ks-sq',
      'One canonical gate run owns the intake switch.'
    );
    requireMailbox();
    test.setTimeout(120_000);
    const info = idaTarget(rawInfo, 'ida.localhost');
    const adminOrigin = getProjectUrlInfo(rawInfo, null).origin;

    await withRecoveryAccount('super_admin', admin =>
      withRecoveryAccount('member', async owner => {
        const context = await browser.newContext({
          extraHTTPHeaders: {
            ...pilotHeaders,
            'x-forwarded-for': `2001:db8:${owner.id.slice(0, 4)}::1`,
          },
          storageState: emptyStorage,
        });
        const seen = new Set<string>();
        const mails: OtpMail[] = [];
        try {
          const page = await context.newPage();
          const recovery = await mountRecovery(page, info, owner);
          const replacement = e2eEmail(`recovery-replacement-${randomUUID()}`);
          await enterCurrentProof(recovery, owner.email, replacement, seen, mails);
          await expect(recovery.locator('form')).toBeVisible();

          const settings = await browser.newPage({ storageState: emptyStorage });
          try {
            await login(settings, adminOrigin, admin);
            await navigateToPilotSettings(settings, rawInfo, adminOrigin);
            await expect(settings.getByRole('button', { name: 'Close switch' })).toBeVisible();
            try {
              await changeIntake(settings, false);
              const [response] = await Promise.all([
                page.waitForResponse(
                  result =>
                    result.request().method() === 'POST' &&
                    Boolean(result.request().headers()['next-action'])
                ),
                recovery.getByRole('button', { name: 'Verify and send replacement code' }).click(),
              ]);
              expect(response.status()).toBe(200);
              expect(
                /(?:^|\n)[\da-f]+:\{"ok":false,"code":"CLOSED"\}(?:\r?\n|$)/.test(
                  await response.text()
                )
              ).toBe(true);
              await expect(recovery.getByRole('status')).toHaveText(
                'Changing your sign-in email is currently closed.'
              );
              await expect(recovery.getByRole('heading', { name: recoveryHeading })).toBeFocused();
              await expect(recovery.locator('form')).toHaveCount(0);
              expect(await mailIds(owner.email)).toEqual([...seen]);
              const unexpectedMail = await mailIds(replacement);
              for (const id of unexpectedMail) seen.add(id);
              expect(unexpectedMail).toHaveLength(0);
              expect(await persistedOwner(owner.id)).toMatchObject({ email: owner.email });
            } finally {
              await navigateToPilotSettings(settings, rawInfo, adminOrigin);
              if (await settings.getByRole('button', { name: 'Open switch' }).isVisible()) {
                await changeIntake(settings, true);
              }
              await expect(settings.getByRole('button', { name: 'Close switch' })).toBeVisible();
            }
          } finally {
            await settings.close();
          }
        } catch (error) {
          throw redact(error, mails);
        } finally {
          await context.close();
          await deleteMail(seen);
        }
      })
    );
  });

  test('completes both proofs while intake is open and keeps the flow accessible', async ({
    browser,
  }, rawInfo) => {
    requireMailbox();
    test.setTimeout(120_000);
    const info = idaTarget(rawInfo, 'ida.localhost');
    await withRecoveryAccount('member', async owner => {
      const context = await browser.newContext({
        extraHTTPHeaders: {
          ...pilotHeaders,
          'x-forwarded-for': `2001:db8:${owner.id.slice(0, 4)}::1`,
        },
        storageState: emptyStorage,
      });
      const seen = new Set<string>();
      const mails: OtpMail[] = [];
      try {
        const page = await context.newPage();
        const recovery = await mountRecovery(page, info, owner);
        await expect(recovery).not.toContainText(owner.email);
        await expect(recovery.locator('input')).toHaveCount(0);
        await page.setViewportSize({ width: 320, height: 720 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        expect(await recovery.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);

        const replacement = e2eEmail(`recovery-replacement-${randomUUID()}`);
        await enterCurrentProof(recovery, owner.email, replacement, seen, mails);
        await recovery.getByRole('button', { name: 'Verify and send replacement code' }).click();
        await expect(
          recovery.getByRole('heading', { name: 'Verify replacement email' })
        ).toBeFocused();
        const mail = await waitForOtpMail(replacement, seen);
        mails.push(mail);
        expect(mail.to).toBe(replacement);
        expect(mail.subject).toBe('Confirm your new email');
        await enter(recovery.getByLabel('Verification code'), mail.code);
        await recovery.getByRole('button', { name: 'Confirm replacement email' }).click();
        await expect(recovery.getByRole('status')).toHaveText(
          'Email changed. Your saved drafts stay with the same account.'
        );
        expect(await persistedOwner(owner.id)).toEqual({
          id: owner.id,
          email: replacement,
          emailVerified: true,
          tenantId,
        });
      } catch (error) {
        throw redact(error, mails);
      } finally {
        await context.close();
        await deleteMail(seen);
      }
    });

    const noJs = await browser.newContext({
      javaScriptEnabled: false,
      extraHTTPHeaders: pilotHeaders,
      storageState: emptyStorage,
    });
    try {
      const page = await noJs.newPage();
      await gotoApp(page, routes.home('en'), info, { marker: 'free-start-intake-shell' });
      await expect(page.getByTestId('different-email-recovery')).toHaveCount(0);
    } finally {
      await noJs.close();
    }
  });
});
