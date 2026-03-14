import { E2E_USERS, claims, db, user } from '@interdomestik/database';
import { and, desc, eq } from 'drizzle-orm';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

async function resolveSeededClaimContext(testInfo: import('@playwright/test').TestInfo) {
  const seededMember = testInfo.project.name.includes('mk')
    ? E2E_USERS.MK_MEMBER
    : E2E_USERS.KS_MEMBER;

  const member = await db.query.user.findFirst({
    where: eq(user.email, seededMember.email),
    columns: { id: true, tenantId: true },
  });

  if (!member?.id || !member.tenantId) {
    throw new Error(`Expected seeded member context for ${seededMember.email}`);
  }

  const claim = await db.query.claims.findFirst({
    where: and(eq(claims.tenantId, member.tenantId), eq(claims.userId, member.id)),
    columns: { id: true },
    orderBy: [desc(claims.createdAt)],
  });

  if (!claim?.id) {
    throw new Error(`Expected a seeded claim for ${seededMember.email}`);
  }

  return { claimId: claim.id };
}

test.describe('Matter allowance visibility', () => {
  test('member and staff see annual matter usage on canonical claim detail pages', async ({
    authenticatedPage: memberPage,
    staffPage,
  }, testInfo) => {
    const { claimId } = await resolveSeededClaimContext(testInfo);

    await gotoApp(memberPage, routes.memberClaimDetail(claimId, testInfo), testInfo, {
      marker: 'member-claim-matter-allowance',
    });

    await expect(memberPage.getByTestId('member-claim-matter-allowance')).toBeVisible();
    await expect(memberPage.getByTestId('member-claim-matter-allowance-used')).toHaveText('0');
    await expect(memberPage.getByTestId('member-claim-matter-allowance-remaining')).toHaveText('2');
    await expect(memberPage.getByTestId('member-claim-matter-allowance-total')).toHaveText('2');

    await gotoApp(staffPage, routes.staffClaimDetail(claimId, testInfo), testInfo, {
      marker: 'staff-claim-detail-matter-allowance',
    });

    await expect(staffPage.getByTestId('staff-claim-detail-matter-allowance')).toBeVisible();
    await expect(staffPage.getByTestId('staff-claim-detail-matter-allowance-used')).toHaveText('0');
    await expect(staffPage.getByTestId('staff-claim-detail-matter-allowance-remaining')).toHaveText(
      '2'
    );
    await expect(staffPage.getByTestId('staff-claim-detail-matter-allowance-total')).toHaveText(
      '2'
    );
  });
});
