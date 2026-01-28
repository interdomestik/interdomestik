import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';

test.describe('Diaspora Feature', () => {
  test('Member can see Diaspora ribbon and navigate to Diaspora page', async ({
    authenticatedPage: page,
  }) => {
    // 1. Go to Member Home
    await page.goto(routes.member());

    // Assert we are on the dashboard
    await expect(page.getByTestId('dashboard-heading')).toBeVisible();

    // 2. Check for Diaspora ribbon/section
    // Use a more specific locator to avoid ambiguity with the new Crystal Home cards
    const ribbonText = page.getByRole('heading', { name: /Diaspor/i }).first();
    await expect(ribbonText).toBeVisible();

    // 3. Navigate to Diaspora page
    // The button has Link with href="/member/diaspora"
    const ribbonCta = page.locator('a[href*="/member/diaspora"]');
    await expect(ribbonCta).toBeVisible();
    await ribbonCta.click();

    // 4. Assert we are on the Diaspora page
    await expect(page).toHaveURL(/\/member\/diaspora/);
    await expect(page.getByTestId('diaspora-page')).toBeVisible();

    // Check for the 3 cards content (using flexible text matching)
    await expect(page.getByText(/(Aksident jashtë vendit|Accident abroad)/i)).toBeVisible();
    await expect(page.getByText(/(Udhëtim \/ Avio|Travel \/ Flight)/i)).toBeVisible();
    await expect(page.getByText(/(Familja në Kosovë|Family in Kosovo)/i)).toBeVisible();
  });
});
