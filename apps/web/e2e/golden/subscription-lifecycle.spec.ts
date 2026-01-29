import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

/**
 * Subscription Lifecycle (Golden Flow)
 *
 * Verifies: Signup -> Plan Selection -> Checkout (Mock) -> Active Membership
 */
test.describe('Golden Flow: Subscription Lifecycle', () => {
  test('New user can register and subscribe to standard plan', async ({ page }, testInfo) => {
    const unique = Date.now().toString(36);
    const email = `sub-e2e-${unique}@example.com`;
    const password = 'TestPassword123!';
    const fullName = `Sub E2E ${unique}`;

    // 1. Register
    await gotoApp(page, routes.register(testInfo), testInfo, { marker: 'registration-page-ready' });

    await page.fill('input[name="fullName"]', fullName);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="confirmPassword"]', password);
    await page.check('#terms');
    await page.click('button[type="submit"]');

    // 2. land on member dashboard - status should be inactive
    await expect(page.getByTestId('dashboard-page-ready')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(new RegExp(`.*${routes.member(testInfo)}`));

    // Rule #4: Use data-testid for critical status
    const statusBadge = page.getByTestId('protection-status');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toContainText(/No Active Protection|Pa Mbrojtje Aktive/i);

    // 3. Go to pricing to activate
    await gotoApp(page, routes.pricing(testInfo), testInfo, { marker: 'pricing-page-ready' });

    // 4. Start Checkout (Standard)
    await page.getByTestId('plan-cta-standard').click();

    // 5. Verify Success Page
    await expect(page).toHaveURL(/.*\/member\/membership\/success/, { timeout: 15000 });
    await expect(page.getByTestId('success-page-ready')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('success-card')).toBeVisible({ timeout: 15000 });

    // 6. Verify Active Membership in UI
    await gotoApp(page, routes.memberMembership(testInfo), testInfo, {
      marker: 'membership-page-ready',
    });

    const subItem = page.getByTestId('subscription-item').first();
    await expect(subItem).toBeVisible();
    await expect(subItem).toContainText(/ACTIVE/i);
    await expect(subItem.getByTestId('subscription-plan-name')).toContainText(/Standard/i);
  });
});
