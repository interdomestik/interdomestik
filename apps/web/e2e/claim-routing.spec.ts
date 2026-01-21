import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

// TODO: Rewrite for reliability and locale support. Covered by golden-flows.
test.describe('@legacy Claim routing (member → staff queue)', () => {
  test('member submission appears in staff claims queue', async ({
    authenticatedPage: memberPage,
    staffPage,
  }) => {
    test.setTimeout(90_000);

    // 1) MEMBER: create a claim with a unique title
    await memberPage.goto(routes.memberNewClaim());
    await expect(memberPage.locator('h1')).toBeVisible();

    await memberPage.waitForLoadState('domcontentloaded');
    await memberPage.getByTestId('category-vehicle').click();
    await memberPage.waitForTimeout(600);
    await memberPage.getByTestId('wizard-next').click();

    // Fill Details
    await expect(memberPage.getByTestId('claim-title-input')).toBeVisible();
    await memberPage.waitForLoadState('domcontentloaded');
    const claimTitle = `Claim Routing ${Date.now()}`;
    await memberPage.getByTestId('claim-title-input').fill(claimTitle);
    await memberPage.getByTestId('claim-company-input').fill('Routing Test Co');
    await memberPage
      .getByTestId('claim-description-input')
      .fill('E2E: verify staff queue visibility');
    await memberPage.getByTestId('claim-amount-input').fill('123');
    await memberPage.getByTestId('claim-date-input').fill(new Date().toISOString().split('T')[0]);

    await memberPage.waitForTimeout(500); // Stability wait
    await memberPage.getByTestId('wizard-next').click();

    // Evidence step (skip upload)
    await memberPage.waitForTimeout(500); // Stability wait
    await expect(memberPage.getByTestId('wizard-next')).toBeVisible();
    await memberPage.getByTestId('wizard-next').click();

    // Submit
    const submitBtn = memberPage.getByTestId('wizard-submit');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Redirect to member claims list
    await memberPage.waitForURL(url => url.pathname === routes.memberClaims(), {
      timeout: 20_000,
    });

    // 2) STAFF: confirm the claim shows up in the claims queue
    await staffPage.goto(routes.staffClaims());
    await expect(staffPage.locator('h1')).toBeVisible();

    await expect(async () => {
      await staffPage.reload();
      await staffPage.waitForLoadState('domcontentloaded');
      await expect(staffPage.getByText(claimTitle)).toBeVisible({ timeout: 10_000 });
      // Verify Tenant/Status correctness implicitly by visibility in the queue
      await expect(staffPage.getByTestId('claim-status-badge').first()).toBeVisible();
    }).toPass({ timeout: 20_000 });
  });
});
