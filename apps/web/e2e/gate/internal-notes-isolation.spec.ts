import { claimStageHistory, db, eq } from '@interdomestik/database';
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { resolveSeededClaimContext } from '../utils/seeded-claim-context';
import { gotoApp } from '../utils/navigation';

test.describe('Internal Notes Isolation', () => {
  test('member claim detail never renders a staff-only internal history note', async ({
    authenticatedPage: memberPage,
  }, testInfo) => {
    test.setTimeout(90_000);

    const { claimId, currentStatus, staffId, tenantId } = await resolveSeededClaimContext(testInfo);
    const internalHistoryId = `e2e-s05-hist-${randomUUID()}`;
    const internalHistoryNote = `S05 internal history ${Date.now()}`;

    await db.insert(claimStageHistory).values({
      id: internalHistoryId,
      tenantId,
      claimId,
      fromStatus: currentStatus,
      toStatus: currentStatus,
      changedById: staffId,
      changedByRole: 'staff',
      note: internalHistoryNote,
      isPublic: false,
      createdAt: new Date(),
    });

    try {
      await gotoApp(memberPage, routes.memberClaimDetail(claimId, testInfo), testInfo, {
        marker: 'ops-timeline',
      });

      await expect(memberPage.getByTestId('ops-timeline')).toBeVisible({
        timeout: 10_000,
      });
      await expect(memberPage.getByText(internalHistoryNote)).toHaveCount(0);
    } finally {
      await db.delete(claimStageHistory).where(eq(claimStageHistory.id, internalHistoryId));
    }
  });
});
