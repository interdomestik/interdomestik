import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

// TODO: Rewrite for reliability and locale support. Covered by golden-flows.
test.describe.skip('Claim routing (member → staff queue)', () => {
  test('member submission appears in staff claims queue', async ({
    authenticatedPage: memberPage,
    staffPage,
  }) => {
    test.setTimeout(90_000);

    // 1) MEMBER: create a claim with a unique title
    await memberPage.goto(routes.memberNewClaim('en'));
    await expect(memberPage.locator('h1')).toContainText('New Claim');

    await memberPage.waitForLoadState('domcontentloaded');
    await memberPage.getByTestId('category-vehicle').click();
    await memberPage.waitForTimeout(600);
    await memberPage.getByTestId('wizard-next').click();

    await memberPage.waitForLoadState('domcontentloaded');
    const claimTitle = `Claim Routing ${Date.now()}`;
    await memberPage.getByLabel('Claim Title').fill(claimTitle, { timeout: 15_000 });
    await memberPage.getByLabel('Company Name').fill('Routing Test Co');
    await memberPage.getByLabel('Description').fill('E2E: verify staff queue visibility');
    await memberPage.getByLabel('Amount (Optional)').fill('123');
    await memberPage.getByLabel('Date of Incident').fill(new Date().toISOString().split('T')[0]);

    await memberPage.getByTestId('wizard-next').click();

    // Evidence step (skip upload)
    await memberPage.getByTestId('wizard-next').click();

    // Submit
    const submitBtn = memberPage.getByTestId('wizard-submit');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Redirect to member claims list
    await memberPage.waitForURL(url => url.pathname === routes.memberClaims('en'), {
      timeout: 20_000,
    });

    // 2) STAFF: confirm the claim shows up in the claims queue
    await staffPage.goto(routes.staffClaims('en'));
    await expect(staffPage.getByRole('heading', { name: 'Claims Queue' })).toBeVisible();

    await expect(async () => {
      await staffPage.reload();
      await staffPage.waitForLoadState('domcontentloaded');
      await expect(staffPage.getByText(claimTitle)).toBeVisible({ timeout: 10_000 });
      // Verify Tenant/Status correctness implicitly by visibility in the queue
      await expect(staffPage.getByRole('cell', { name: 'Submitted' }).first()).toBeVisible();
    }).toPass({ timeout: 20_000 });
  });
});
