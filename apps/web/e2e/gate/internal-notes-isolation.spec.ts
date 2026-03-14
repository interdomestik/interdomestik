import { E2E_USERS, claimStageHistory, claims, db, user } from '@interdomestik/database';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

async function resolveMemberClaimContext(testInfo: import('@playwright/test').TestInfo) {
  const seededMember = testInfo.project.name.includes('mk')
    ? E2E_USERS.MK_MEMBER
    : E2E_USERS.KS_MEMBER;
  const seededStaff = testInfo.project.name.includes('mk')
    ? E2E_USERS.MK_STAFF
    : E2E_USERS.KS_STAFF;

  const member = await db.query.user.findFirst({
    where: eq(user.email, seededMember.email),
    columns: { id: true, tenantId: true },
  });
  const staff = await db.query.user.findFirst({
    where: eq(user.email, seededStaff.email),
    columns: { id: true },
  });

  if (!member?.id || !member.tenantId) {
    throw new Error(`Expected seeded member context for ${seededMember.email}`);
  }

  if (!staff?.id) {
    throw new Error(`Expected seeded staff context for ${seededStaff.email}`);
  }

  const claim = await db.query.claims.findFirst({
    where: and(eq(claims.tenantId, member.tenantId), eq(claims.userId, member.id)),
    columns: { id: true, status: true },
    orderBy: [desc(claims.createdAt)],
  });

  if (!claim?.id) {
    throw new Error(`Expected a seeded claim for ${seededMember.email}`);
  }

  return {
    claimId: claim.id,
    currentStatus: claim.status ?? 'submitted',
    staffId: staff.id,
    tenantId: member.tenantId,
  };
}

test.describe('Internal Notes Isolation', () => {
  test('member claim detail never renders a staff-only internal history note', async ({
    authenticatedPage: memberPage,
  }, testInfo) => {
    test.setTimeout(90_000);

    const { claimId, currentStatus, staffId, tenantId } = await resolveMemberClaimContext(testInfo);
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
        marker: 'body',
      });

      await expect(memberPage.getByRole('button', { name: 'Send Message' })).toBeVisible({
        timeout: 10_000,
      });
      await expect(memberPage.getByText(internalHistoryNote)).toHaveCount(0);
    } finally {
      await db.delete(claimStageHistory).where(eq(claimStageHistory.id, internalHistoryId));
    }
  });
});
