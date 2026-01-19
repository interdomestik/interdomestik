import { expect, test } from '../fixtures/auth.fixture';

test.describe('Gate: Critical Path › Agent Flow', () => {
  test('Agent can view leads page', async ({ agentPage }) => {
    // 1. Navigate to leads page (force locale sq for this project)
    await agentPage.goto('/sq/agent/leads');
    await agentPage.waitForLoadState('domcontentloaded');

    // 2. Verify we're on the leads page (URL check)
    await expect(agentPage).toHaveURL(/\/agent\/leads/);

    // 3. Verify main content renders
    const mainContent = agentPage.locator('main').first();
    await expect(mainContent).toBeVisible();

    // 4. Page loaded successfully - verify body has content
    const body = agentPage.locator('body');
    await expect(body).toBeVisible();

    // Check that we're not on an error page
    const errorHeading = agentPage.getByRole('heading', { name: /error|500|404/i });
    await expect(errorHeading).not.toBeVisible();

    // Test passes if page loads without errors
  });
});
