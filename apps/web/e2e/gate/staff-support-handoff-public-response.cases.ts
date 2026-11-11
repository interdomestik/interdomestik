import { db, eq, supportHandoffs } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import {
  cleanupHandoffBySubject,
  cleanupPublicResponseNotifications,
  countPublicResponseNotifications,
  escapeRegExp,
  getPublicResponseNotification,
  openAcceptedSupportHandoffRow,
  requireHandoffIds,
  restoreMemberSession,
  submitMemberHelpHandoff,
} from './staff-support-handoff.fixture';
import {
  acknowledgeVisibleMemberPublicResponse,
  expectMemberReplyVersion,
  expectPublicResponseAcknowledgedVersion,
  expectPublicResponseVersion,
  expectVisible,
  openSupportHandoffDetail,
  submitVisibleMemberReply,
} from './support-handoff-response.test-support';
import { expectManagerHandoffMetadata } from './support-handoff-metadata.test-support';

export function registerPublicResponseCase() {
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
      await openSupportHandoffDetail(acceptedRow);
      await expectVisible(acceptedRow.getByTestId('staff-support-handoff-public-response-form'));
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
      await expectVisible(updateRow.getByTestId('staff-support-handoff-public-response-badge'));
      await expectVisible(updateRow.getByTestId('staff-support-handoff-needs-follow-up-badge'));
      await openSupportHandoffDetail(updateRow);
      await expect(
        updateRow.getByTestId('staff-support-handoff-public-response-input')
      ).toHaveValue(firstResponse, { timeout: 15000 });
      await expectVisible(
        updateRow.getByTestId('staff-support-handoff-public-response-acknowledged')
      );
      await expect(updateRow.getByTestId('handoff-member-reply')).toContainText(memberReply, {
        timeout: 15000,
      });
      await expectVisible(updateRow.getByTestId('staff-support-handoff-member-reply-warning'));
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
      await openSupportHandoffDetail(followedUpRow);
      await expectVisible(
        followedUpRow.getByTestId('staff-support-handoff-public-response-awaiting-acknowledgement')
      );
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

      await expectManagerHandoffMetadata(branchManagerPage, testInfo, handoffId, [
        subject,
        'Public response E2E handoff with enough detail for staff follow-up.',
        firstResponse,
        updatedResponse,
        memberReply,
      ]);

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
}
