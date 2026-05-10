import { and, claims, db, eq, notifications, supportHandoffs } from '@interdomestik/database';
import {
  request as playwrightRequest,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import {
  buildUiLoginUrl,
  credsFor,
  getProjectUrlInfo,
  getTenantFromTestInfo,
  ipForRole,
} from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { resolveSeededClaimContext } from '../utils/seeded-claim-context';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function cleanupHandoffBySubject(subject: string): Promise<void> {
  await db.delete(supportHandoffs).where(eq(supportHandoffs.subject, subject));
}

async function cleanupPublicResponseNotifications(memberId: string): Promise<void> {
  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.userId, memberId),
        eq(notifications.type, 'support_handoff_public_response')
      )
    );
}

async function countPublicResponseNotifications(
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

async function getPublicResponseNotification(memberId: string, actionUrl: string) {
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

async function restoreMemberSession(page: Page, testInfo: TestInfo): Promise<void> {
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

async function submitMemberHelpHandoff(args: {
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

async function requireHandoffIds(
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

async function openAcceptedSupportHandoffRow(
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

async function expectPublicResponseVersion(
  subject: string,
  response: string,
  version: number
): Promise<void> {
  await expect
    .poll(
      async () => {
        const handoff = await db.query.supportHandoffs.findFirst({
          where: eq(supportHandoffs.subject, subject),
          columns: {
            publicResponse: true,
            publicResponseAt: true,
            publicResponseVersion: true,
          },
        });

        return handoff?.publicResponse === response && handoff.publicResponseAt
          ? handoff.publicResponseVersion
          : null;
      },
      { timeout: 15000, intervals: [250, 500, 1000] }
    )
    .toBe(version);
}

async function expectPublicResponseAcknowledgedVersion(
  subject: string,
  version: number
): Promise<void> {
  await expect
    .poll(
      async () => {
        const handoff = await db.query.supportHandoffs.findFirst({
          where: eq(supportHandoffs.subject, subject),
          columns: {
            publicResponseAcknowledgedAt: true,
            publicResponseAcknowledgedVersion: true,
          },
        });

        return handoff?.publicResponseAcknowledgedAt
          ? handoff.publicResponseAcknowledgedVersion
          : null;
      },
      { timeout: 15000, intervals: [250, 500, 1000] }
    )
    .toBe(version);
}

async function expectMemberReplyVersion(
  subject: string,
  reply: string,
  version: number
): Promise<void> {
  await expect
    .poll(
      async () => {
        const handoff = await db.query.supportHandoffs.findFirst({
          where: eq(supportHandoffs.subject, subject),
          columns: {
            memberReply: true,
            memberReplyAt: true,
            memberReplyResponseVersion: true,
          },
        });

        return handoff?.memberReply === reply && handoff.memberReplyAt
          ? handoff.memberReplyResponseVersion
          : null;
      },
      { timeout: 15000, intervals: [250, 500, 1000] }
    )
    .toBe(version);
}

async function acknowledgeVisibleMemberPublicResponse(
  memberPage: Page,
  response: string
): Promise<void> {
  const responseBanner = memberPage
    .getByTestId('member-support-handoff-public-response')
    .filter({ hasText: response })
    .first();
  await expect(responseBanner).toBeVisible({ timeout: 15000 });
  await responseBanner.getByTestId('member-support-handoff-public-response-ack-submit').click();
  await expect(
    responseBanner.getByTestId('member-support-handoff-public-response-acknowledged')
  ).toBeVisible({ timeout: 15000 });
}

async function submitVisibleMemberReply(memberPage: Page, reply: string): Promise<void> {
  const responseBanner = memberPage.getByTestId('member-support-handoff-public-response').first();
  await expect(responseBanner.getByTestId('member-reply-form')).toBeVisible({ timeout: 15000 });
  await responseBanner.getByTestId('member-reply-input').fill(reply);
  await responseBanner.getByTestId('member-reply-submit').click();
  await expect(responseBanner.getByTestId('member-reply-success')).toBeVisible({ timeout: 15000 });
  await expect(responseBanner.getByTestId('member-reply-form')).toHaveCount(0);
}

test.describe('CRM01 staff support handoff receiving queue', () => {
  test('member support request appears in staff queue and can be accepted', async ({
    authenticatedPage: memberPage,
    staffPage,
  }, testInfo) => {
    const subject = `E2E CRM01 support handoff ${testInfo.project.name} ${Date.now()}`;

    await cleanupHandoffBySubject(subject);

    try {
      await submitMemberHelpHandoff({
        memberPage,
        message: 'Please route this support handoff to the staff receiving queue.',
        subject,
        testInfo,
      });
      await expect(memberPage.getByTestId('member-support-handoff-created')).toBeVisible();

      await expect
        .poll(
          async () => {
            const handoff = await db.query.supportHandoffs.findFirst({
              where: eq(supportHandoffs.subject, subject),
              columns: { id: true },
            });

            return handoff?.id ?? null;
          },
          { timeout: 15000, intervals: [250, 500, 1000] }
        )
        .toBeTruthy();
      const createdHandoff = await db.query.supportHandoffs.findFirst({
        where: eq(supportHandoffs.subject, subject),
        columns: { id: true },
      });
      if (!createdHandoff?.id) {
        throw new Error(`Expected persisted support handoff for subject ${subject}`);
      }

      await gotoApp(
        staffPage,
        `${routes.staffSupportHandoffs(testInfo)}?search=${encodeURIComponent(subject)}`,
        testInfo,
        { marker: 'staff-page-ready' }
      );

      const row = staffPage.getByTestId('staff-support-handoffs-row').filter({ hasText: subject });
      await expect(row).toBeVisible({ timeout: 15000 });
      await expect(row.getByTestId('staff-support-handoff-accept')).toBeVisible();
      await row.getByTestId('staff-support-handoff-accept').click();

      await expect
        .poll(
          async () => {
            const handoff = await db.query.supportHandoffs.findFirst({
              where: eq(supportHandoffs.subject, subject),
              columns: { id: true, staffId: true, status: true },
            });

            return handoff?.id === createdHandoff.id && handoff.status === 'accepted'
              ? handoff.staffId
              : null;
          },
          { timeout: 15000, intervals: [250, 500, 1000] }
        )
        .toBeTruthy();
    } finally {
      await cleanupHandoffBySubject(subject);
    }
  });

  test('member claim detail support request reaches staff queue with linked claim context', async ({
    authenticatedPage: memberPage,
    loginAs,
  }, testInfo) => {
    const { claimId } = await resolveSeededClaimContext(testInfo);
    const claim = await db.query.claims.findFirst({
      where: eq(claims.id, claimId),
      columns: { claimNumber: true, id: true, title: true },
    });
    const claimLabel = claim?.claimNumber || claim?.title || claimId;
    const subject = `E2E CRM02 claim handoff ${testInfo.project.name} ${Date.now()}`;
    const message =
      'Please help with this claim from the claim detail page. I need a phone callback with full context visible to staff.';

    await cleanupHandoffBySubject(subject);

    try {
      await gotoApp(memberPage, routes.memberClaimDetail(claimId, testInfo), testInfo, {
        marker: 'member-claim-trust-sla-panel',
      });

      const supportLink = memberPage
        .locator('[data-testid="member-claim-trust-sla-support-link"]:visible')
        .first();
      await expect(supportLink).toBeVisible();
      await expect(supportLink).toHaveAttribute('href', new RegExp(`claimId=${claimId}`));
      await expect(supportLink).toHaveAttribute('href', /source=member_claim_detail/);
      const supportHref = await supportLink.getAttribute('href');
      expect(supportHref).toBeTruthy();
      await gotoApp(memberPage, supportHref!, testInfo, {
        marker: 'member-support-handoff-form',
      });
      await expect(memberPage).toHaveURL(
        url =>
          url.pathname.endsWith('/member/help') &&
          url.searchParams.get('claimId') === claimId &&
          url.searchParams.get('source') === 'member_claim_detail',
        { timeout: 15000 }
      );

      await expect(memberPage.getByTestId('member-support-handoff-form')).toBeVisible();
      await expect(memberPage.getByTestId('member-support-handoff-claim-context')).toContainText(
        claimLabel
      );
      await expect(memberPage.getByTestId('member-support-handoff-claim')).toHaveValue(claimId);

      await memberPage.getByTestId('member-support-handoff-subject').fill(subject);
      await memberPage.getByTestId('member-support-handoff-message').fill(message);
      await memberPage
        .getByTestId('member-support-handoff-contact-preference')
        .selectOption('phone');
      await memberPage.getByTestId('member-support-handoff-submit').click();

      await expect(memberPage).toHaveURL(/\/member\/help\?support=created$/, {
        timeout: 15000,
      });

      await expect
        .poll(
          async () => {
            const handoff = await db.query.supportHandoffs.findFirst({
              where: eq(supportHandoffs.subject, subject),
              columns: { claimId: true, id: true, source: true },
            });

            return handoff?.claimId === claimId ? handoff.source : null;
          },
          { timeout: 15000, intervals: [250, 500, 1000] }
        )
        .toBe('member_claim_detail');

      await loginAs('staff');
      await gotoApp(
        memberPage,
        `${routes.staffSupportHandoffs(testInfo)}?search=${encodeURIComponent(subject)}`,
        testInfo,
        { marker: 'staff-page-ready' }
      );

      const row = memberPage.getByTestId('staff-support-handoffs-row').filter({ hasText: subject });
      await expect(row).toBeVisible({ timeout: 15000 });
      await expect(row.getByTestId('staff-support-handoff-claim-link')).toContainText(claimLabel);
      await row.getByTestId('staff-support-handoff-detail-toggle').click();
      await expect(row.getByTestId('staff-support-handoff-detail-panel')).toBeVisible({
        timeout: 15000,
      });
      await expect(row.getByTestId('staff-support-handoff-contact-preference')).toContainText(
        /Phone callback|Телефон|telefon/i
      );
      await expect(row.getByTestId('staff-support-handoff-full-message')).toContainText(message);
      await expect(row.getByTestId('staff-support-handoff-source')).toContainText(
        /Claim detail page|detajeve|detalja|детали/i
      );
      await expect(row.getByTestId('staff-support-handoff-lifecycle-created')).toBeVisible();
    } finally {
      await cleanupHandoffBySubject(subject);
    }
  });

  test('member help advisory is visible and remains non-blocking for a second handoff', async ({
    authenticatedPage: memberPage,
  }, testInfo) => {
    const { claimId } = await resolveSeededClaimContext(testInfo);
    const subject = `E2E CRM05 advisory ${testInfo.project.name} ${Date.now()}`;
    const secondSubject = `${subject} second`;
    const claimHelpPath = `${routes.memberHelp(testInfo)}?claimId=${encodeURIComponent(claimId)}`;
    const currentMemberSurface = () => memberPage.getByTestId('member-page-ready').last();

    await cleanupHandoffBySubject(subject);
    await cleanupHandoffBySubject(secondSubject);

    try {
      await gotoApp(memberPage, claimHelpPath, testInfo, {
        marker: 'member-page-ready',
      });
      await expect(memberPage.getByTestId('member-support-handoff-form')).toBeVisible();
      await expect(memberPage.getByTestId('member-support-handoff-claim')).toHaveValue(claimId);

      await memberPage.getByTestId('member-support-handoff-subject').fill(subject);
      await memberPage
        .getByTestId('member-support-handoff-message')
        .fill('First advisory test handoff with enough detail for submission.');
      await memberPage.getByTestId('member-support-handoff-submit').click();

      await expect(memberPage).toHaveURL(/\/member\/help\?support=created$/, {
        timeout: 15000,
      });
      await expect(memberPage.getByTestId('member-support-handoff-created')).toBeVisible();
      await expect(memberPage.getByTestId('member-support-handoff-advisory-generic')).toBeVisible({
        timeout: 15000,
      });

      await gotoApp(memberPage, routes.memberHelp(testInfo), testInfo, {
        marker: 'member-page-ready',
      });
      await expect(memberPage.getByTestId('member-support-handoff-advisory-generic')).toBeVisible({
        timeout: 15000,
      });

      await gotoApp(memberPage, claimHelpPath, testInfo, {
        marker: 'member-page-ready',
      });
      const claimAdvisory = currentMemberSurface().getByTestId(
        'member-support-handoff-advisory-claim'
      );
      await expect(claimAdvisory).toBeVisible({ timeout: 15000 });
      await expect(currentMemberSurface().getByTestId('member-support-handoff-claim')).toHaveValue(
        claimId
      );

      await currentMemberSurface()
        .getByTestId('member-support-handoff-subject')
        .fill(secondSubject);
      await currentMemberSurface()
        .getByTestId('member-support-handoff-message')
        .fill('Second advisory test handoff proving the advisory remains non-blocking.');
      await currentMemberSurface().getByTestId('member-support-handoff-submit').click();

      await expect(memberPage).toHaveURL(/\/member\/help\?support=created$/, {
        timeout: 15000,
      });
      await expect(memberPage.getByTestId('member-support-handoff-created')).toBeVisible();
    } finally {
      await cleanupHandoffBySubject(subject);
      await cleanupHandoffBySubject(secondSubject);
    }
  });

  test('staff can send a public response that notifies the member until close', async ({
    authenticatedPage: memberPage,
    branchManagerPage,
    staffPage,
  }, testInfo) => {
    const subject = `E2E CRM06 public response ${testInfo.project.name} ${Date.now()}`;
    const firstResponse = `CRM06 member-visible update ${Date.now()}`;
    const memberReply = `CRM09 member reply ${Date.now()}`;
    const updatedResponse = `${firstResponse} updated`;
    const memberHelpRoute = routes.memberHelp(testInfo);
    let handoffId: string | null = null;
    let memberId: string | null = null;

    await cleanupHandoffBySubject(subject);

    try {
      await submitMemberHelpHandoff({
        memberPage,
        message: 'Public response E2E handoff with enough detail for staff follow-up.',
        subject,
        testInfo,
      });

      ({ handoffId, memberId } = await requireHandoffIds(subject));
      const memberHelpUrl = `${memberHelpRoute}?handoffId=${encodeURIComponent(handoffId)}`;
      const responseNotificationMemberId = memberId;
      await cleanupPublicResponseNotifications(responseNotificationMemberId);

      await gotoApp(
        staffPage,
        `${routes.staffSupportHandoffs(testInfo)}?search=${encodeURIComponent(subject)}`,
        testInfo,
        { marker: 'staff-page-ready' }
      );
      const row = staffPage.getByTestId('staff-support-handoffs-row').filter({ hasText: subject });
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.getByTestId('staff-support-handoff-accept').click();

      await expect
        .poll(
          async () => {
            const handoff = await db.query.supportHandoffs.findFirst({
              where: eq(supportHandoffs.subject, subject),
              columns: { status: true },
            });

            return handoff?.status ?? null;
          },
          { timeout: 15000, intervals: [250, 500, 1000] }
        )
        .toBe('accepted');

      const acceptedRow = await openAcceptedSupportHandoffRow(staffPage, subject, testInfo);
      await acceptedRow.getByTestId('staff-support-handoff-detail-toggle').click();
      await expect(
        acceptedRow.getByTestId('staff-support-handoff-public-response-form')
      ).toBeVisible({ timeout: 15000 });
      await acceptedRow
        .getByTestId('staff-support-handoff-public-response-input')
        .fill(firstResponse);
      await acceptedRow.getByTestId('staff-support-handoff-public-response-submit').click();

      await expectPublicResponseVersion(subject, firstResponse, 1);

      await expect
        .poll(() => countPublicResponseNotifications(responseNotificationMemberId, memberHelpUrl), {
          timeout: 15000,
          intervals: [250, 500, 1000],
        })
        .toBe(1);

      const notification = await getPublicResponseNotification(
        responseNotificationMemberId,
        memberHelpUrl
      );
      expect(notification?.title).toBeTruthy();
      expect(notification?.content).toBeTruthy();
      expect(notification?.actionUrl).toBe(memberHelpUrl);

      await restoreMemberSession(memberPage, testInfo);
      await gotoApp(memberPage, memberHelpUrl, testInfo, {
        marker: 'member-page-ready',
      });
      await expect(memberPage).toHaveURL(new RegExp(`${escapeRegExp(memberHelpUrl)}$`), {
        timeout: 15000,
      });
      await acknowledgeVisibleMemberPublicResponse(memberPage, firstResponse);
      await expectPublicResponseAcknowledgedVersion(subject, 1);
      await submitVisibleMemberReply(memberPage, memberReply);
      await expectMemberReplyVersion(subject, memberReply, 1);

      await gotoApp(
        staffPage,
        `${routes.staffSupportHandoffs(testInfo)}?attention=needs_follow_up&search=${encodeURIComponent(subject)}`,
        testInfo,
        { marker: 'staff-page-ready' }
      );
      const updateRow = staffPage
        .getByTestId('staff-support-handoffs-row')
        .filter({ hasText: subject });
      await expect(
        updateRow.getByTestId('staff-support-handoff-public-response-badge')
      ).toBeVisible({
        timeout: 15000,
      });
      await expect(
        updateRow.getByTestId('staff-support-handoff-needs-follow-up-badge')
      ).toBeVisible({ timeout: 15000 });
      await updateRow.getByTestId('staff-support-handoff-detail-toggle').click();
      await expect(
        updateRow.getByTestId('staff-support-handoff-public-response-input')
      ).toHaveValue(firstResponse, { timeout: 15000 });
      await expect(
        updateRow.getByTestId('staff-support-handoff-public-response-acknowledged')
      ).toBeVisible({ timeout: 15000 });
      await expect(updateRow.getByTestId('handoff-member-reply')).toContainText(memberReply, {
        timeout: 15000,
      });
      await expect(updateRow.getByTestId('staff-support-handoff-member-reply-warning')).toBeVisible(
        { timeout: 15000 }
      );
      await updateRow
        .getByTestId('staff-support-handoff-public-response-input')
        .fill(updatedResponse);
      await updateRow.getByTestId('staff-support-handoff-public-response-submit').click();

      await expectPublicResponseVersion(subject, updatedResponse, 2);
      await expect(updateRow).toHaveCount(0, { timeout: 15000 });
      await expect(
        staffPage.getByTestId('staff-support-handoffs-row').filter({ hasText: subject })
      ).toHaveCount(0, { timeout: 15000 });

      const followedUpRow = await openAcceptedSupportHandoffRow(staffPage, subject, testInfo);
      await followedUpRow.getByTestId('staff-support-handoff-detail-toggle').click();
      await expect(
        followedUpRow.getByTestId('staff-support-handoff-public-response-awaiting-acknowledgement')
      ).toBeVisible({ timeout: 15000 });
      await expect(followedUpRow.getByTestId('handoff-member-reply')).toContainText(memberReply, {
        timeout: 15000,
      });
      await expect(
        followedUpRow.getByTestId('staff-support-handoff-member-reply-warning')
      ).toHaveCount(0);

      await expect
        .poll(() => countPublicResponseNotifications(responseNotificationMemberId, memberHelpUrl), {
          timeout: 15000,
          intervals: [250, 500, 1000],
        })
        .toBe(2);

      await gotoApp(memberPage, memberHelpUrl, testInfo, {
        marker: 'member-page-ready',
      });
      await acknowledgeVisibleMemberPublicResponse(memberPage, updatedResponse);
      await expectPublicResponseAcknowledgedVersion(subject, 2);
      await expect(
        memberPage
          .getByTestId('member-support-handoff-public-response')
          .first()
          .getByTestId('member-reply-form')
      ).toHaveCount(0);
      await expect(
        memberPage
          .getByTestId('member-support-handoff-public-response')
          .first()
          .getByTestId('member-reply-success')
      ).toBeVisible({ timeout: 15000 });

      await gotoApp(
        branchManagerPage,
        `${routes.staffSupportHandoffs(testInfo)}?status=accepted&search=${encodeURIComponent(subject)}`,
        testInfo,
        { marker: 'staff-page-ready' }
      );
      const managerRow = branchManagerPage
        .getByTestId('staff-support-handoffs-row')
        .filter({ hasText: subject });
      await expect(managerRow).toBeVisible({ timeout: 15000 });
      await managerRow.getByTestId('staff-support-handoff-detail-toggle').click();
      await expect(
        managerRow.getByTestId('staff-support-handoff-public-response-existing')
      ).toContainText(updatedResponse, { timeout: 15000 });
      await expect(
        managerRow.getByTestId('staff-support-handoff-public-response-acknowledged')
      ).toBeVisible({ timeout: 15000 });
      await expect(
        managerRow.getByTestId('staff-support-handoff-public-response-form')
      ).toHaveCount(0);
      await expect(
        managerRow.getByTestId('staff-support-handoff-public-response-readonly')
      ).toBeVisible();

      const closeRow = await openAcceptedSupportHandoffRow(staffPage, subject, testInfo);
      await closeRow.getByTestId('staff-support-handoff-close-reason').fill('Resolved in E2E');
      await closeRow.getByTestId('staff-support-handoff-close').click();

      await expect
        .poll(
          async () => {
            const handoff = await db.query.supportHandoffs.findFirst({
              where: eq(supportHandoffs.subject, subject),
              columns: { status: true },
            });

            return handoff?.status ?? null;
          },
          { timeout: 15000, intervals: [250, 500, 1000] }
        )
        .toBe('closed');

      await gotoApp(memberPage, memberHelpUrl, testInfo, {
        marker: 'member-page-ready',
      });
      await expect(memberPage.getByTestId('member-support-handoff-public-response')).toHaveCount(0);
      await expect
        .poll(() => countPublicResponseNotifications(responseNotificationMemberId, memberHelpUrl), {
          timeout: 15000,
          intervals: [250, 500, 1000],
        })
        .toBe(0);
      await gotoApp(memberPage, routes.member(testInfo), testInfo, {
        marker: 'dashboard-page-ready',
      });
      await expect(memberPage).toHaveURL(new RegExp(`${escapeRegExp(routes.member(testInfo))}$`), {
        timeout: 15000,
      });
    } finally {
      if (memberId) {
        await cleanupPublicResponseNotifications(memberId);
      }
      await cleanupHandoffBySubject(subject);
    }
  });
});
