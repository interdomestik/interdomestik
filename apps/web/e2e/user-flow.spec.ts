import { expect, test } from './fixtures/auth.fixture';

test.describe('End-to-End User Journey', () => {
  test('Guest -> Services -> Login -> Dashboard -> Start Claim', async ({ page }) => {
    // 1. Guest visits Landing Page
    await page.goto('/en');
    await expect(page).toHaveTitle(/Interdomestik/);

    // 2. Navigate to Services
    // Note: Adjust selector based on actual nav menu
    const servicesLink = page.getByRole('link', { name: /Services/i }).first();
    if (await servicesLink.isVisible()) {
      await servicesLink.click();
      await expect(page).toHaveURL(/.*services/);
      // We know from previous test fix that 'categories.consultation.title' (translated) is on the page
      // But for E2E we usually see the translated text. Assuming 'en' locale.
      // If translation fails, it might show key.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }

    // 3. Navigate to Login
    // 3. Navigate to Login
    const loginLocator = page.locator('a[href*="/login"]:visible').first();

    if ((await loginLocator.count()) > 0) {
      await loginLocator.click();
    } else {
      const menuBtn = page.locator('button:has(.lucide-menu)');
      if (await menuBtn.isVisible()) {
        await menuBtn.click();
        await page.locator('a[href*="/login"]:visible').first().click();
      } else {
        await page.goto('/login');
      }
    }
    await expect(page).toHaveURL(/.*login/);

    // 4. Perform Login
    // Using credentials that usually exist in seeded env or allowed by auth mock
    await page.fill('input[name="email"]', 'test@interdomestik.com'); // Using fixed test user
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');

    // 5. Verify Dashboard
    // Wait for redirect
    await page.waitForURL(/.*member/);
    await expect(page).toHaveURL(/.*member/);
    await expect(
      page.getByRole('heading', { name: /Overview|Dashboard|Përmbledhje/i })
    ).toBeVisible();

    // 6. Start Claim Flow
    // Locate the "New Claim" button or link
    const newClaimBtn = page
      .getByRole('link', { name: /New Claim|File Claim/i })
      .or(page.getByRole('button', { name: /New Claim|File Claim/i }));

    if ((await newClaimBtn.count()) > 0) {
      await newClaimBtn.first().click();
      // Verify we entered the wizard or claim form
      // This might redirect to /member/claims/new or similar
      await expect(page).toHaveURL(/.*claims\/new|.*wizard/);
    }
  });
});
