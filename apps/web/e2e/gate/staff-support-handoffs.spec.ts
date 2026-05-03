import { claims, db, eq, supportHandoffs } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { resolveSeededClaimContext } from '../utils/seeded-claim-context';

async function cleanupHandoffBySubject(subject: string): Promise<void> {
  await db.delete(supportHandoffs).where(eq(supportHandoffs.subject, subject));
}

test.describe('CRM01 staff support handoff receiving queue', () => {
  test('member support request appears in staff queue and can be accepted', async ({
    authenticatedPage: memberPage,
    staffPage,
  }, testInfo) => {
    const subject = `E2E CRM01 support handoff ${Date.now()}`;

    await cleanupHandoffBySubject(subject);

    try {
      await gotoApp(memberPage, routes.memberHelp(testInfo), testInfo, {
        marker: 'member-page-ready',
      });
      await expect(memberPage.getByTestId('member-support-handoff-form')).toBeVisible();

      await memberPage.getByTestId('member-support-handoff-subject').fill(subject);
      await memberPage
        .getByTestId('member-support-handoff-message')
        .fill('Please route this support handoff to the staff receiving queue.');
      await memberPage.getByTestId('member-support-handoff-submit').click();

      await expect(memberPage).toHaveURL(/\/member\/help\?support=created$/, {
        timeout: 15000,
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
    const subject = `E2E CRM02 claim handoff ${Date.now()}`;

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
      const supportHref = await supportLink.getAttribute('href');
      expect(supportHref).toBeTruthy();
      await gotoApp(memberPage, supportHref!, testInfo, {
        marker: 'member-support-handoff-form',
      });
      await expect(memberPage).toHaveURL(
        url => url.pathname.endsWith('/member/help') && url.searchParams.get('claimId') === claimId,
        { timeout: 15000 }
      );

      await expect(memberPage.getByTestId('member-support-handoff-form')).toBeVisible();
      await expect(memberPage.getByTestId('member-support-handoff-claim-context')).toContainText(
        claimLabel
      );
      await expect(memberPage.getByTestId('member-support-handoff-claim')).toHaveValue(claimId);

      await memberPage.getByTestId('member-support-handoff-subject').fill(subject);
      await memberPage
        .getByTestId('member-support-handoff-message')
        .fill('Please help with this claim from the claim detail page.');
      await memberPage.getByTestId('member-support-handoff-submit').click();

      await expect(memberPage).toHaveURL(/\/member\/help\?support=created$/, {
        timeout: 15000,
      });

      await expect
        .poll(
          async () => {
            const handoff = await db.query.supportHandoffs.findFirst({
              where: eq(supportHandoffs.subject, subject),
              columns: { claimId: true, id: true },
            });

            return handoff?.claimId ?? null;
          },
          { timeout: 15000, intervals: [250, 500, 1000] }
        )
        .toBe(claimId);

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
    } finally {
      await cleanupHandoffBySubject(subject);
    }
  });
});
