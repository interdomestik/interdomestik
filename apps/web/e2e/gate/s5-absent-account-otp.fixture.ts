import { crmLeads, db, eq, sql, user, verification } from '@interdomestik/database';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { enter, localCopy, type OtpMail } from './s5-otp-mailbox.fixture';

export async function proveAbsentOtpRefusal(args: {
  browser: Browser;
  start: Page;
  absentEmail: string;
  tenant: string;
  clientHeaders: Record<string, string>;
  requestCode: () => Promise<{ mail: OtpMail; panel: Locator }>;
}) {
  const { browser, start, absentEmail, tenant, clientHeaders, requestCode } = args;
  const userRow = () => db.query.user.findFirst({ where: eq(user.email, absentEmail) });
  const pendingCodeCount = () =>
    db.$count(verification, eq(verification.identifier, `sign-in-otp-${absentEmail}`));
  const SUBJECT = 'Your email confirmation code';
  const { mail: absentMail, panel: absentPanel } =
    await test.step('a real code is delivered and stored hashed', async () => {
      const sent = await requestCode();
      expect(sent.mail.subject, 'subject is the static neutral text').toBe(SUBJECT);
      expect(sent.mail.to).toBe(absentEmail);
      expect(await userRow(), 'no account exists before verification').toBeUndefined();
      const stored = await db.execute<{ value: string }>(
        sql`select value from verification where identifier like ${`%${absentEmail}`}`
      );
      expect(stored, 'one pending code').toHaveLength(1);
      expect(stored[0]!.value.includes(sent.mail.code), 'the code is not stored in clear').toBe(
        false
      );
      return sent;
    });

  await test.step('a cookie-free untrusted origin cannot consume a valid code', async () => {
    const hostile = await browser.newContext({
      baseURL: start.url(),
      extraHTTPHeaders: clientHeaders,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const response = await hostile.request.post(
        `${new URL(start.url()).origin}/api/auth/sign-in/email-otp`,
        {
          data: {
            email: absentEmail,
            onboarding: { mode: 'deferred', tenant },
            otp: absentMail.code,
          },
          failOnStatusCode: false,
          headers: { Origin: 'https://untrusted.invalid', 'x-tenant-id': tenant },
        }
      );
      expect(response.status(), 'an untrusted pre-auth origin is rejected').toBe(403);
      expect(await hostile.cookies(), 'origin rejection opens no browser session').toEqual([]);
      expect(await userRow(), 'origin rejection creates no account').toBeUndefined();
      expect(await pendingCodeCount(), 'origin rejection leaves the challenge pending').toBe(1);
      expect(await localCopy(start), 'the valid browser copy remains').toBe(true);
    } finally {
      await hostile.close();
    }
  });

  await test.step('the right code for an absent account is refused and the browser copy is kept', async () => {
    await enter(absentPanel.getByTestId('free-start-save-code'), absentMail.code);
    const [response] = await Promise.all([
      start.waitForResponse(
        response =>
          new URL(response.url()).pathname === '/api/auth/sign-in/email-otp' &&
          response.request().method() === 'POST'
      ),
      absentPanel.getByTestId('free-start-save-verify').click(),
    ]);
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ code: 'INVALID_OTP', message: 'Invalid OTP' });
    await expect(absentPanel.locator('#free-start-save-error')).toBeVisible();
    expect(await userRow()).toBeUndefined();
    expect(await pendingCodeCount(), 'door refusal leaves the challenge pending').toBe(1);
    expect(
      (await start.context().cookies()).some(cookie => cookie.name.includes('session_token'))
    ).toBe(false);
    expect(await localCopy(start)).toBe(true);
    expect(await db.$count(crmLeads, eq(crmLeads.email, absentEmail))).toBe(0);
  });
  return absentPanel;
}
