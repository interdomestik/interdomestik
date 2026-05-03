import { db, eq, supportHandoffs } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

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
});
