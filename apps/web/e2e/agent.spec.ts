import { expect, test } from './fixtures/auth.fixture';

test.describe('Agent Workspace Flow', () => {
  test('Agent can view dashboard stats and recent claims', async ({ agentPage: page }) => {
    await page.goto('/en/agent');

    // Check titles
    await expect(page.getByRole('heading', { name: /Agent Workspace/i })).toBeVisible();

    // Check stats cards
    await expect(page.getByText('Total Claims')).toBeVisible();
    await expect(page.getByText('New (Submitted)')).toBeVisible();

    // Check recent activity card
    await expect(page.getByText('Recent Activity')).toBeVisible();
  });

  test('Agent can view and navigate claims queue', async ({ agentPage: page }) => {
    await page.goto('/en/agent/claims');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Claims Queue' })).toBeVisible();

    await expect(page.getByRole('table')).toBeVisible();

    // Check table headers
    await expect(page.getByRole('columnheader', { name: 'Claimant' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Claim', exact: true })).toBeVisible();

    // Check if at least one claim is present (seeded data)
    const firstReviewButton = page.getByRole('link', { name: /Review Case/i }).first();
    await expect(firstReviewButton).toBeVisible();
  });

  test('Agent can view claim details and update status', async ({ agentPage: page }) => {
    await page.goto('/en/agent/claims');
    await page.waitForLoadState('networkidle');

    // Click on the first claim
    const reviewLink = page.getByRole('link', { name: /Review Case/i }).first();
    await reviewLink.click();

    await page.waitForLoadState('networkidle');

    // Check detail sections
    await expect(page.getByText('Claimant Information')).toBeVisible();
    await expect(page.getByText('Case Timeline')).toBeVisible();
    await expect(page.getByText('Evidence Files')).toBeVisible();

    // Check detail status select
    const statusSelect = page.getByRole('combobox').first();
    await expect(statusSelect).toBeVisible();

    // Update status to Verification
    await statusSelect.click();
    await page.getByRole('option', { name: /verification/i }).click();

    // Verify toast or updated status (if possible)
    await expect(page.getByText('Status updated successfully')).toBeVisible();
  });
});
