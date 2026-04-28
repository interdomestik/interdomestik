import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { resolveSeededClaimContext } from '../utils/seeded-claim-context';
import { gotoApp } from '../utils/navigation';

test.describe('Matter allowance visibility', () => {
  test('member and staff see annual matter usage on canonical claim detail pages', async ({
    authenticatedPage: memberPage,
    staffPage,
  }, testInfo) => {
    const { claimId } = await resolveSeededClaimContext(testInfo);

    await gotoApp(memberPage, routes.memberClaimDetail(claimId, testInfo), testInfo, {
      marker: 'member-claim-matter-allowance',
    });

    const memberMatterAllowance = memberPage
      .locator('[data-testid="member-claim-matter-allowance"]:visible')
      .last();
    await expect(memberMatterAllowance).toBeVisible();
    await expect(
      memberMatterAllowance.getByTestId('member-claim-matter-allowance-used')
    ).toHaveText('0');
    await expect(
      memberMatterAllowance.getByTestId('member-claim-matter-allowance-remaining')
    ).toHaveText('2');
    await expect(
      memberMatterAllowance.getByTestId('member-claim-matter-allowance-total')
    ).toHaveText('2');

    await gotoApp(staffPage, routes.staffClaimDetail(claimId, testInfo), testInfo, {
      marker: 'staff-claim-detail-matter-allowance',
    });

    const staffMatterAllowance = staffPage
      .locator('[data-testid="staff-claim-detail-matter-allowance"]:visible')
      .last();
    await expect(staffMatterAllowance).toBeVisible();
    await expect(
      staffMatterAllowance.getByTestId('staff-claim-detail-matter-allowance-used')
    ).toHaveText('0');
    await expect(
      staffMatterAllowance.getByTestId('staff-claim-detail-matter-allowance-remaining')
    ).toHaveText('2');
    await expect(
      staffMatterAllowance.getByTestId('staff-claim-detail-matter-allowance-total')
    ).toHaveText('2');
  });
});
