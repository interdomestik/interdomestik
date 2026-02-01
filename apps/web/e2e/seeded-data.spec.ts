/**
 * Seeded Data Verification Tests
 *
 * These tests verify that seeded test data is present and accessible.
 * They depend on the seed script having run successfully.
 *
 * SKIP in CI: These tests are fragile as they depend on exact seeded data
 * which can change over time. They serve as documentation of what seed data
 * should produce.
 */

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

const runSeededDataTests = process.env.RUN_SEEDED_DATA_TESTS === '1';

test.describe('Seeded Data Verification', () => {
  test.skip(!runSeededDataTests, 'Requires seeded data. Set RUN_SEEDED_DATA_TESTS=1 to enable.');
  test('should display all seeded claims on dashboard', async ({ authenticatedPage }, testInfo) => {
    // Go to dashboard claims list
    await gotoApp(authenticatedPage, routes.memberClaims('en'), testInfo);

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

  test('should show correct status for specific claims', async ({
    authenticatedPage,
  }, testInfo) => {
    await gotoApp(authenticatedPage, routes.memberClaims('en'), testInfo);
    await authenticatedPage.waitForSelector('text=Car Accident');

    // Helper to find row with text and check badge
    const checkStatus = async (title: string, status: string) => {
      const card = authenticatedPage.locator(`div:has-text("${title}")`).first();
      await expect(card).toContainText(status, { ignoreCase: true });
    };

    await checkStatus('Car Accident - Rear Ended', 'Submitted');
    await checkStatus('Flight Delay to Munich', 'Verification');
    await checkStatus('Rejected Insurance Claim', 'Rejected');
  });

  test('should view claim details', async ({ authenticatedPage }, testInfo) => {
    await gotoApp(authenticatedPage, routes.memberClaims('en'), testInfo);

    // Click on a claim
    // Navigate directly using href for stability
    const link = authenticatedPage
      .locator('tr', { hasText: 'Flight Delay to Munich' })
      .getByRole('link');
    const href = await link.getAttribute('href');
    await gotoApp(authenticatedPage, href!, testInfo);
    await authenticatedPage.waitForLoadState('domcontentloaded');

    // Verify detail content
    await expect(authenticatedPage.locator('h1, h2')).toContainText('Flight Delay to Munich');
    await expect(authenticatedPage.getByText('Austrian Airlines')).toBeVisible();
    await expect(authenticatedPage.getByText('600.00')).toBeVisible(); // Amount
  });
});
