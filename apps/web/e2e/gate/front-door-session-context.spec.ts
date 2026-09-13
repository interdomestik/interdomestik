import { randomUUID } from 'node:crypto';

import { db, E2E_PASSWORD, E2E_USERS, eq, notifications, user } from '@interdomestik/database';
import { expect, test, type TestInfo } from '@playwright/test';

import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

type FrontDoorTenant = 'tenant_ks' | 'tenant_mk';

function projectInfo(baseURL: string | undefined): {
  origin: string;
  locale: string;
} {
  const url = new URL(baseURL ?? 'https://ida.127.0.0.1.nip.io:3000');
  const firstSegment = url.pathname.split('/').find(Boolean) ?? 'en';
  const locale = /^(sq|mk|en)$/i.test(firstSegment) ? firstSegment.toLowerCase() : 'en';
  return { origin: url.origin, locale };
}

function frontDoorTenant(testInfo: TestInfo): FrontDoorTenant | null {
  const tenantId = testInfo.project.use.extraHTTPHeaders?.['x-tenant-id'];
  if (tenantId === 'tenant_mk' || tenantId === 'tenant_ks') return tenantId;
  return null;
}

function userForTenant(tenantId: FrontDoorTenant) {
  return tenantId === 'tenant_mk' ? E2E_USERS.MK_MEMBER : E2E_USERS.KS_MEMBER;
}

test.describe('Front-door session context', () => {
  test('renders ida.* public landing without a tenant cookie', async ({ browser }, testInfo) => {
    const { origin, locale } = projectInfo(testInfo.project.use.baseURL?.toString());
    const isIdaHost = new URL(origin).hostname.startsWith('ida.');
    test.skip(!isIdaHost, 'front-door public contract only runs in ida projects');

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      const docResponse = await gotoApp(page, new URL(`/${locale}`, origin).toString(), testInfo, {
        marker: 'landing-page-ready',
      });

      expect(docResponse?.headers()['x-e2e-tenant']).toBe('none');
      expect(docResponse?.headers()['x-e2e-tenant-context']).toBe('public');
      await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);

      const tenantCookie = (await context.cookies(origin)).find(
        cookie => cookie.name === 'tenantId'
      );
      expect(tenantCookie).toBeUndefined();
    } finally {
      await context.close();
    }
  });

  test('logs in on ida.* without country-host tenant identity', async ({ page }, testInfo) => {
    const { origin, locale } = projectInfo(testInfo.project.use.baseURL?.toString());
    const projectHeaders = testInfo.project.use.extraHTTPHeaders ?? {};
    const tenantId = frontDoorTenant(testInfo);
    test.skip(tenantId === null, 'front-door session contract only runs in front-door projects');
    if (tenantId === null) {
      throw new Error('unreachable: front-door session skip did not abort the test');
    }
    const seededUser = userForTenant(tenantId);
    const forwardedHostHeader = 'x-forwarded-host';

    expect(projectHeaders[forwardedHostHeader]).toBeUndefined();
    expect(new URL(origin).hostname.startsWith('ida.')).toBe(true);

    const signInRes = await page.request.post(
      new URL('/api/auth/sign-in/email', origin).toString(),
      {
        data: { email: seededUser.email, password: E2E_PASSWORD },
        headers: {
          Origin: origin,
          Referer: `${origin}/${locale}/login`,
          ...projectHeaders,
        },
      }
    );
    expect(signInRes.ok(), await signInRes.text()).toBe(true);

    const sessionRes = await page.request.get(new URL('/api/auth/get-session', origin).toString(), {
      headers: {
        Origin: origin,
        ...projectHeaders,
      },
    });
    expect(sessionRes.ok(), await sessionRes.text()).toBe(true);

    const sessionPayload = (await sessionRes.json()) as {
      user?: { tenantId?: string | null };
    } | null;
    expect(sessionPayload?.user?.tenantId).toBe(tenantId);

    await gotoApp(page, new URL(`/${locale}/member`, origin).toString(), testInfo, {
      marker: 'body',
    });

    await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);
    await expect(page.getByTestId('member-dashboard-ready').first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('keeps keyboard acknowledgement truthful and retains action navigation', async ({
    page,
  }, testInfo) => {
    const origin = new URL(String(testInfo.project.use.baseURL)).origin;
    const projectHeaders = testInfo.project.use.extraHTTPHeaders ?? {};
    const tenantId = frontDoorTenant(testInfo);
    const isIdaHost = new URL(origin).hostname.startsWith('ida.');
    test.skip(
      tenantId === null || !isIdaHost,
      'notification acknowledgement browser proof only runs in neutral IDA front-door projects'
    );
    if (tenantId === null || !isIdaHost) {
      throw new Error('unreachable: notification front-door skip did not abort the test');
    }
    const member = userForTenant(tenantId);

    const signIn = await page.request.post(new URL('/api/auth/sign-in/email', origin).toString(), {
      data: { email: member.email, password: E2E_PASSWORD },
      headers: {
        Origin: origin,
        Referer: `${origin}/${routes.getLocale(testInfo)}/login`,
        ...projectHeaders,
      },
    });
    expect(signIn.ok(), await signIn.text()).toBe(true);

    const subscriber = await db.query.user.findFirst({
      columns: { id: true, tenantId: true },
      where: eq(user.email, member.email),
    });
    if (!subscriber?.tenantId) throw new Error('Seeded member is missing subscriber identity');

    const notificationId = `t410-ack-${randomUUID()}`;
    const title = `Acknowledgement ${notificationId}`;
    await db.insert(notifications).values({
      id: notificationId,
      tenantId: subscriber.tenantId,
      userId: subscriber.id,
      type: 'new_message',
      title,
      content: 'A bounded notification acknowledgement browser fixture.',
      actionUrl: routes.memberClaims(testInfo),
      isRead: false,
    });

    try {
      await gotoApp(page, routes.member(testInfo), testInfo, {
        marker: 'member-dashboard-ready',
      });
      const trigger = page.getByTestId('notification-center-trigger');
      await expect(trigger).toBeVisible();
      await expect(trigger).toHaveAccessibleName(/.+/);
      await trigger.focus();
      await trigger.press('Enter');

      const row = page.getByTestId('notification-item-new_message').filter({ hasText: title });
      const markAll = page.getByTestId('notification-mark-all');
      const acknowledge = row.getByRole('menuitem', { name: new RegExp(title) });
      const action = row.getByTestId('notification-action');
      await expect(row).toBeVisible();
      await expect(markAll).toHaveRole('menuitem');
      await expect(markAll).toHaveAccessibleName(/.+/);
      await expect(action).toHaveRole('menuitem');
      await expect(action).toHaveAccessibleName(/.+/);
      await page.keyboard.press('ArrowDown');
      await expect(markAll).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(acknowledge).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(action).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(acknowledge).toBeFocused();
      await page.keyboard.press('Enter');

      await expect(acknowledge).toHaveCount(0);
      await expect
        .poll(async () => {
          const stored = await db.query.notifications.findFirst({
            columns: { isRead: true },
            where: eq(notifications.id, notificationId),
          });
          return stored?.isRead;
        })
        .toBe(true);

      await action.click();
      await expect(page).toHaveURL(new RegExp(`${routes.memberClaims(testInfo)}$`));
    } finally {
      await db.delete(notifications).where(eq(notifications.id, notificationId));
    }
  });
});
