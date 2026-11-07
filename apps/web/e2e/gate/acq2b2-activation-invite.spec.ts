import {
  account,
  db,
  eq,
  leadPaymentAttempts,
  memberLeads,
  session as authSession,
  sql,
  user,
  verification,
} from '@interdomestik/database';
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/auth.fixture';
import { path as routePath } from '../fixtures/routes';
import { gotoApp } from '../utils/navigation';
import {
  insertOwnedMemberLead,
  removeOwnedMemberLead,
  type OwnedLead,
} from '../utils/owned-member-lead';
import { api, deleteMail, json, mailboxConfigured } from './s5-otp-mailbox.fixture';
import { interactiveLogin } from './test/login-handoff-page';

// The set-password link is a credential until it is used, so this spec records no trace, video or
// screenshot.
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

const SUBJECT = 'Set your password';

type Summary = { ID: string; Subject: string };

async function waitForActivationLink(email: string, seen: Set<string>): Promise<URL> {
  let found: Summary | undefined;
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${email}"`);
        const list = await json<{ messages: Summary[] }>(await fetch(api(`search?query=${query}`)));
        found = list.messages.find(message => message.Subject === SUBJECT);
        return Boolean(found);
      },
      { message: 'the activation email arrived', timeout: 30_000 }
    )
    .toBe(true);
  seen.add(found!.ID);
  const body = await json<{ Text: string }>(
    await fetch(api(`message/${encodeURIComponent(found!.ID)}`))
  );
  const link = /^Set password: (\S+)$/mu.exec(body.Text)?.[1];
  expect(link, 'the email carries one set-password link').toBeTruthy();
  return new URL(link!);
}

async function convertedMemberId(leadId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: memberLeads.convertedUserId })
    .from(memberLeads)
    .where(eq(memberLeads.id, leadId));
  return row?.id ?? null;
}

/**
 * ACQ-2b2 (owner decision B): approving a cash payment converts the lead and emails the member a
 * password-set link through the existing reset flow on this deployment. The member sets a
 * password from it and signs in as the converted account; nobody else chose that credential.
 */
test.describe('ACQ-2b2 member activation invite', () => {
  test('an approved cash member sets a password from the invite and signs in', async ({
    adminPage,
    browser,
  }, testInfo) => {
    testInfo.skip(testInfo.project.name !== 'gate-ks-sq', 'One canonical run converts a member.');
    if (process.env.E2E_OTP_PROOF_REQUIRED === '1') {
      expect(mailboxConfigured(), 'the lane provides the mail catcher').toBe(true);
    }
    testInfo.skip(!mailboxConfigured(), 'Needs E2E_SMTP_HOST (loopback mail catcher).');
    test.setTimeout(180_000);
    const tenantOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
    const seen = new Set<string>();
    const context = await browser.newContext();
    let lead: OwnedLead | undefined;
    let memberId: string | null = null;
    try {
      lead = await insertOwnedMemberLead('ks', 'acq2b2', 'Activation');
      const owned = lead;
      const [{ tenantId }] = await db
        .select({ tenantId: memberLeads.tenantId })
        .from(memberLeads)
        .where(eq(memberLeads.id, owned.id));
      // Fixture setup: the approval and what follows it are under test, not lead entry or cash.
      await db.insert(leadPaymentAttempts).values({
        id: `${owned.id}_attempt`,
        tenantId,
        leadId: owned.id,
        method: 'cash',
        status: 'pending',
        amount: 15000,
      });
      await db
        .update(memberLeads)
        .set({ status: 'payment_pending' })
        .where(eq(memberLeads.id, owned.id));

      const query = new URLSearchParams({ query: owned.email });
      await gotoApp(adminPage, `/admin/leads?${query}`, testInfo, {
        marker: 'verification-ops-page',
      });
      await adminPage
        .getByTestId('cash-verification-row')
        .filter({ visible: true })
        .filter({ has: adminPage.getByText(owned.email, { exact: true }) })
        .getByTestId('cash-approve')
        .click();
      await expect.poll(() => convertedMemberId(owned.id)).not.toBeNull();
      memberId = await convertedMemberId(owned.id);

      // The member opens the exact emailed link: Better Auth checks the token and returns them to
      // the reset page on this deployment, never to a host the lane does not serve.
      const link = await waitForActivationLink(owned.email, seen);
      const servedOrigins = [link.origin, tenantOrigin];
      expect(link.pathname).toMatch(/^\/api\/auth\/reset-password\/[^/]+$/u);
      const resetPath = new URL(routePath(testInfo, '/reset-password')).pathname;
      const page = await context.newPage();
      await gotoApp(page, link, testInfo, { baseURL: link.origin, marker: 'domcontentloaded' });
      await expect(page).toHaveURL(url => {
        const landed = new URL(url);
        const onResetPage = landed.pathname === resetPath && landed.searchParams.has('token');
        return servedOrigins.includes(landed.origin) && onResetPage;
      });
      // A fresh browser meets the cookie notice first; the member declines optional cookies.
      const consentBanner = page.getByTestId('cookie-consent-banner');
      await expect(consentBanner).toBeVisible();
      await page.getByTestId('cookie-consent-decline').click();
      await expect(consentBanner).toHaveCount(0);

      const password = `Activ8-${randomUUID()}`;
      const form = page.getByRole('form', { name: 'Reset password form' });
      // SSR-visible controls are not handler readiness: retry until the client handler submits.
      await expect(async () => {
        await form.locator('#password').fill(password);
        await form.locator('#confirmPassword').fill(password);
        await form.locator('button[type="submit"]').click();
        await expect(page).toHaveURL(/\/sq\/login(?:\?|$)/u, { timeout: 10_000 });
      }).toPass({ timeout: 40_000 });

      // The member signs in on their tenant host; this lane serves no neutral front door on loopback.
      await gotoApp(page, '/login', testInfo, { marker: 'domcontentloaded' });
      await interactiveLogin(page, 'sq');
      if (await consentBanner.isVisible()) {
        await page.getByTestId('cookie-consent-decline').click();
        await expect(consentBanner).toHaveCount(0);
      }
      await page.getByTestId('login-email').fill(owned.email);
      await page.getByTestId('login-password').fill(password);
      await page.getByTestId('login-submit').click();
      const memberHome = new URL(routePath(testInfo, '/member')).pathname;
      await expect(page).toHaveURL(url => {
        const landed = new URL(url);
        return landed.origin === tenantOrigin && landed.pathname.startsWith(memberHome);
      });

      // The password belongs to the converted account: same user, tenant and role, one mailbox.
      const member = await db.query.user.findFirst({ where: eq(user.id, memberId!) });
      expect(member).toMatchObject({ email: owned.email, role: 'member', tenantId });
      const credentials = await db
        .select({ providerId: account.providerId })
        .from(account)
        .where(eq(account.userId, memberId!));
      expect(credentials).toEqual([{ providerId: 'credential' }]);
      const mailbox = await db
        .select({ id: user.id })
        .from(user)
        .where(sql`lower(${user.email}) = ${owned.email.toLowerCase()}`);
      expect(mailbox).toEqual([{ id: memberId }]);
    } finally {
      await context.close();
      if (memberId) {
        await db.delete(authSession).where(eq(authSession.userId, memberId));
        await db.delete(account).where(eq(account.userId, memberId));
        await db.delete(verification).where(eq(verification.value, memberId));
      }
      await removeOwnedMemberLead(lead);
      await deleteMail(seen);
    }
  });
});
