import { db, sql } from '@interdomestik/database';
import type { Browser, Page, TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import sqAuth from '../../src/messages/sq/auth.json';
import { expect } from '../fixtures/auth.fixture';
import { path as routePath } from '../fixtures/routes';
import { gotoApp } from '../utils/navigation';
import { api, json } from './s5-otp-mailbox.fixture';
import { interactiveLogin } from './test/login-handoff-page';

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

export async function openActivationHistory(adminPage: Page, testInfo: TestInfo, email: string) {
  const history = `/admin/leads?${new URLSearchParams({ view: 'history', query: email })}`;
  await gotoApp(adminPage, history, testInfo, { marker: 'verification-ops-page' });
  return adminPage
    .getByTestId('cash-verification-row')
    .filter({ visible: true })
    .filter({ has: adminPage.getByText(email, { exact: true }) });
}

export async function setPasswordFromActivationInvite({
  browser,
  email,
  seen,
  testInfo,
}: {
  browser: Browser;
  email: string;
  seen: Set<string>;
  testInfo: TestInfo;
}) {
  const tenantOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  // The member opens the invite in a fresh context with the project's tenant headers.
  const context = await browser.newContext({
    extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
    storageState: { cookies: [], origins: [] },
  });
  try {
    // The member opens the exact emailed link: Better Auth checks the token and returns them to
    // the reset page on this deployment, never to a host the lane does not serve.
    const link = await waitForActivationLink(email, seen);
    const servedOrigins = new Set([link.origin, tenantOrigin]);
    expect(link.pathname).toMatch(/^\/api\/auth\/reset-password\/[^/]+$/u);
    const resetPath = new URL(routePath(testInfo, '/reset-password')).pathname;
    const page = await context.newPage();
    await gotoApp(page, link, testInfo, { baseURL: link.origin, marker: 'domcontentloaded' });
    await expect(page).toHaveURL(url => {
      const landed = new URL(url);
      const onResetPage = landed.pathname === resetPath && landed.searchParams.has('token');
      return servedOrigins.has(landed.origin) && onResetPage;
    });
    // A fresh browser meets the cookie notice first; the member declines optional cookies.
    const consentBanner = page.getByTestId('cookie-consent-banner');
    await expect(consentBanner).toBeVisible();
    await page.getByTestId('cookie-consent-decline').click();
    await expect(consentBanner).toHaveCount(0);

    const password = `Activ8-${randomUUID()}`;
    const form = page.getByRole('form', { name: sqAuth.auth.passwordRecovery.formLabel });
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
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    const memberHome = new URL(routePath(testInfo, '/member')).pathname;
    await expect(page).toHaveURL(url => {
      const landed = new URL(url);
      return landed.origin === tenantOrigin && landed.pathname.startsWith(memberHome);
    });
  } finally {
    await context.close();
  }
}

export async function expectActivatedMember(memberId: string, email: string, tenantId: string) {
  // The password belongs to the converted account: same user, tenant and role, one mailbox.
  const [member] = await db.execute(sql`
    select email, role, tenant_id as "tenantId" from "user" where id = ${memberId}
  `);
  expect(member).toMatchObject({ email: email, role: 'member', tenantId });
  const credentials = await db.execute(sql`
    select "providerId" from account where "userId" = ${memberId}
  `);
  expect([...credentials]).toEqual([{ providerId: 'credential' }]);
  const mailbox = await db.execute(sql`
    select id from "user" where lower(email) = ${email.toLowerCase()}
  `);
  expect([...mailbox]).toEqual([{ id: memberId }]);
}

export async function removeActivationCredentials(memberId: string) {
  await db.execute(sql`delete from session where "userId" = ${memberId}`);
  await db.execute(sql`delete from account where "userId" = ${memberId}`);
  await db.execute(sql`delete from verification where value = ${memberId}`);
}
