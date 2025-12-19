import { expect, test } from './fixtures/auth.fixture';

test.describe('Seeded Data Verification', () => {
  test('should display all seeded claims on dashboard', async ({ authenticatedPage }) => {
    // Go to dashboard claims list
    await authenticatedPage.goto('/dashboard/claims');

    // Wait for list to load
    await authenticatedPage.waitForSelector('text=Car Accident', { timeout: 10000 });

    // Verify all seeded claims are visible
    const claims = [
      'Car Accident - Rear Ended',
      'Flight Delay to Munich',
      'Defective Laptop',
      'Water Damage in Apartment',
      'Rejected Insurance Claim',
    ];

    for (const title of claims) {
      await expect(authenticatedPage.getByText(title)).toBeVisible();
    }
  });

  test('should show correct status for specific claims', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard/claims');
    await authenticatedPage.waitForSelector('text=Car Accident');

    // Helper to find row with text and check badge
    const checkStatus = async (title: string, status: string) => {
      // Find a row or card containing the title
      // This selector depends on UI structure, assuming a card/row approach
      // We look for a container that has the title, then look for the status within it
      const card = authenticatedPage.locator(`div:has-text("${title}")`).first();
      // Status badges usually use capitalize or uppercase, let's look loosely
      // Using a flexible locator for badges/tags
      await expect(card).toContainText(status, { ignoreCase: true });
    };

    await checkStatus('Car Accident - Rear Ended', 'Submitted');
    await checkStatus('Flight Delay to Munich', 'Verification');
    await checkStatus('Rejected Insurance Claim', 'Rejected');
  });

  test('should view claim details', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard/claims');

    // Click on a claim
    await authenticatedPage.click('text=Flight Delay to Munich');

    // Wait for detail page (increased timeout for WebKit)
    await authenticatedPage.waitForURL(/\/dashboard\/claims\/claim-/, { timeout: 45000 });

    // Verify detail content
    await expect(authenticatedPage.locator('h1, h2')).toContainText('Flight Delay to Munich');
    await expect(authenticatedPage.getByText('Austrian Airlines')).toBeVisible();
    await expect(authenticatedPage.getByText('600.00')).toBeVisible(); // Amount
  });
});
