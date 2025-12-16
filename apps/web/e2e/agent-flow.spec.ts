import { expect, test } from './fixtures/auth.fixture';

test.describe('Agent Workspace', () => {
  test('should access agent dashboard and view stats', async ({ agentPage }) => {
    await agentPage.goto('/agent');
    await expect(agentPage.locator('h1')).toContainText('Agent Workspace');

    // Check that stats cards are visible
    await expect(agentPage.getByText('Total Claims')).toBeVisible();
    await expect(agentPage.getByText('New (Submitted)')).toBeVisible();
  });

  test('should list claims and allow triage', async ({ agentPage }) => {
    // Navigate to Agent Claims (Force English to match assertions)
    await agentPage.goto('/en/agent/claims');
    await expect(agentPage.locator('h1')).toContainText('Claims Queue');

    // Find a specific claim to triage
    // Use the first claim in the list
    const firstRow = agentPage.locator('tbody tr').first();
    const claimTitle = await firstRow.locator('td').nth(1).locator('.font-medium').textContent();

    // Click Review and wait for navigation
    expect(claimTitle).toBeTruthy();
    await Promise.all([
      agentPage.waitForURL(/\/en\/agent\/claims\/.+/),
      firstRow.getByRole('link', { name: 'Review' }).click(),
    ]);

    // Verify Detail Page
    await expect(agentPage.locator('h1', { hasText: 'Claim Details' })).toBeVisible();
    await expect(
      agentPage.locator('h1, h2, div').filter({ hasText: claimTitle! }).first()
    ).toBeVisible();

    // Perform Triage: Change Status to Verification
    // The Select Trigger displays current status.
    // We open it and select 'verification'.
    // Note: If current status matches, we change to something else.
    // If seed 'Car Accident' is 'Submitted', we verify 'Verification'.

    // Click Select Trigger
    await agentPage.click('button[role="combobox"]');

    // Select Option
    await agentPage.click('div[role="option"]:has-text("Verification")');

    // Verify update (Optimistic or Server Revalidation)
    // The page status badge should update.
    // Wait for network idle or text change.
    await expect(
      agentPage.locator('div.capitalize', { hasText: 'verification' }).first()
    ).toBeVisible();

    // Also verifying the Triage Buttons
    await expect(agentPage.getByRole('button', { name: 'Reject Claim' })).toBeVisible();
  });

  test('should protect agent routes from regular users', async ({ authenticatedPage }) => {
    // Attempt to access agent dashboard as regular user
    await authenticatedPage.goto('/agent');

    // Expect redirect to user dashboard
    await expect(authenticatedPage).toHaveURL(/.*\/dashboard/);
    await expect(authenticatedPage.getByText('Agent Workspace')).not.toBeVisible();
  });
});
