import { and, db, eq, notifications, supportHandoffs } from '@interdomestik/database';
import {
  request as playwrightRequest,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { expect } from '../fixtures/auth.fixture';
import {
  buildUiLoginUrl,
  credsFor,
  getProjectUrlInfo,
  getTenantFromTestInfo,
  ipForRole,
} from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function cleanupHandoffBySubject(subject: string): Promise<void> {
  await db.delete(supportHandoffs).where(eq(supportHandoffs.subject, subject));
}

export async function cleanupPublicResponseNotifications(memberId: string): Promise<void> {
  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.userId, memberId),
        eq(notifications.type, 'support_handoff_public_response')
      )
    );
}

export async function countPublicResponseNotifications(
  memberId: string,
  actionUrl: string
): Promise<number> {
  const rows = await db.query.notifications.findMany({
    where: (table, { and, eq }) =>
      and(
        eq(table.userId, memberId),
        eq(table.type, 'support_handoff_public_response'),
        eq(table.actionUrl, actionUrl)
      ),
    columns: { id: true },
  });

  return rows.length;
}

export function getPublicResponseNotification(memberId: string, actionUrl: string) {
  return db.query.notifications.findFirst({
    where: (table, { and, eq }) =>
      and(
        eq(table.userId, memberId),
        eq(table.type, 'support_handoff_public_response'),
        eq(table.actionUrl, actionUrl)
      ),
    columns: {
      actionUrl: true,
      content: true,
      id: true,
      title: true,
    },
  });
}

export async function restoreMemberSession(page: Page, testInfo: TestInfo): Promise<void> {
  const info = getProjectUrlInfo(testInfo, null);
  const tenant = getTenantFromTestInfo(testInfo);
  const { email, password } = credsFor('member', tenant);
  const projectHeaders = testInfo.project.use.extraHTTPHeaders || {};
  const host = new URL(info.origin).hostname;

  await page.context().clearCookies();
  const authRequest = await playwrightRequest.newContext({
    baseURL: info.origin,
    extraHTTPHeaders: projectHeaders,
    storageState: { cookies: [], origins: [] },
  });

  try {
    const response = await authRequest.post('/api/auth/sign-in/email', {
      data: { email, password },
      headers: {
        Origin: info.origin,
        Referer: buildUiLoginUrl(info),
        'x-forwarded-for': ipForRole('member'),
        ...projectHeaders,
      },
    });

    expect(response.ok(), `member session restore should succeed: ${response.status()}`).toBe(true);
    const requestState = await authRequest.storageState();
    const memberCookies = requestState.cookies.filter(cookie => cookie.domain === host);
    expect(memberCookies.length, 'member session restore should set host cookies').toBeGreaterThan(
      0
    );
    await page.context().addCookies(memberCookies);
  } finally {
    await authRequest.dispose();
  }
}

export async function submitMemberHelpHandoff(args: {
  memberPage: Page;
  message: string;
  subject: string;
  testInfo: TestInfo;
}) {
  await gotoApp(args.memberPage, routes.memberHelp(args.testInfo), args.testInfo, {
    marker: 'member-page-ready',
  });
  const supportForm = args.memberPage.getByTestId('member-support-handoff-form').last();
  await expect(supportForm).toBeVisible();

  await supportForm.getByTestId('member-support-handoff-subject').fill(args.subject);
  await supportForm.getByTestId('member-support-handoff-message').fill(args.message);
  await supportForm.getByTestId('member-support-handoff-submit').click();

  await expect(args.memberPage).toHaveURL(/\/member\/help\?support=created$/, {
    timeout: 15000,
  });
}

export async function requireHandoffIds(
  subject: string
): Promise<{ handoffId: string; memberId: string }> {
  let handoffId: string | null = null;
  let memberId: string | null = null;

  await expect
    .poll(
      async () => {
        const handoff = await db.query.supportHandoffs.findFirst({
          where: eq(supportHandoffs.subject, subject),
          columns: { id: true, memberId: true },
        });

        handoffId = handoff?.id ?? null;
        memberId = handoff?.memberId ?? null;
        return handoffId && memberId ? memberId : null;
      },
      { timeout: 15000, intervals: [250, 500, 1000] }
    )
    .toBeTruthy();

  if (!handoffId || !memberId) {
    throw new Error(`Expected handoff and member ids for support handoff ${subject}`);
  }

  return { handoffId, memberId };
}

export async function openAcceptedSupportHandoffRow(
  staffPage: Page,
  subject: string,
  testInfo: TestInfo
): Promise<Locator> {
  await gotoApp(
    staffPage,
    `${routes.staffSupportHandoffs(testInfo)}?status=accepted&search=${encodeURIComponent(subject)}`,
    testInfo,
    { marker: 'staff-page-ready' }
  );

  const row = staffPage.getByTestId('staff-support-handoffs-row').filter({ hasText: subject });
  await expect(row).toBeVisible({ timeout: 15000 });
  return row;
}
