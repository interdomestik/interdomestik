import { expect, test } from './fixtures/auth.fixture';

test.describe('Agent Claims Access', () => {
  test('Agent can view claims list but has restricted actions', async ({ agentPage: page }) => {
    await page.goto('/en/agent/claims');

    // Agent should have access now
    await expect(page.getByRole('heading', { name: /Claims Queue|Claims/i })).toBeVisible();

    // Check table exists
    await expect(page.getByRole('table')).toBeVisible();

    // Use a locator for the table body rows
    const rows = page.locator('tbody tr');

    // Wait for network idle to ensure data is loaded
    await page.waitForLoadState('networkidle');

    // If we have claims (seeded), they should be View Only.
    // If seed failed, we might see "No claims found".
    // We assertions should check that IF claims exist, Review is not visible.

    // Check if "Review" link is visible - IT SHOULD NOT BE for Agent
    // We use a short timeout because we expect it NOT to be there.
    await expect(page.getByRole('link', { name: /Review Case/i })).toBeHidden();

    // If there are rows and not "No claims", we expect "View Only"
    const noClaims = page.getByText('No claims found');
    if (!(await noClaims.isVisible())) {
      const firstRow = rows.first();
      if (await firstRow.isVisible()) {
        await expect(firstRow).toContainText('View Only');
      }
    }
  });
});
