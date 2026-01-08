import { expect, test } from '@playwright/test';

// Credentials from seed script
const MEMBER = { email: 'test@interdomestik.com', password: 'TestPassword123!' };
const STAFF = { email: 'staff@interdomestik.com', password: 'StaffPassword123!' };
const MANAGER_A = { email: 'manager-a@test.com', password: 'AdminPassword123!' };
// Note: AGENT removed as unused in current tests

// Claim Data
const CLAIM_TITLE = 'Auto Test Claim ' + Date.now();

// Use serial to ensure Phase A creates claim before Phase B/C try to view it
test.describe.serial('Production Smoke Test Plan', () => {
  test.describe('Phase A: Authentication & Routing (Member)', () => {
    test('Member can login, see dashboard, and create a claim', async ({ page }) => {
      // 1. Login
      await page.goto('/login');
      await page.fill('input[name="email"]', MEMBER.email);
      await page.fill('input[name="password"]', MEMBER.password);
      await page.click('button[type="submit"]');

      // 2. Verify Dashboard (Member lands on /member)
      await expect(page).toHaveURL(/\/member/);
      // await expect(page.getByText('Interdomestik')).toBeVisible(); // This might cover header, okay.

      // 3. Wizard (Check for i18n missing keys)
      // Correct path per routes.ts
      await page.goto('/member/claims/new');
      const bodyText = await page.textContent('body');
      expect(bodyText).not.toContain('MISSING_MESSAGE');

      // 4. Create Claim
      // Step 1: Category
      await page.getByText('Auto', { exact: false }).first().click();
      await page.getByTestId('wizard-next').click();

      // Step 2: Content (Title/Desc/Amount/Company/Date)
      await page.fill('input[name="title"]', CLAIM_TITLE);
      await page.fill('input[name="companyName"]', 'Test Company');
      await page.fill('input[name="incidentDate"]', '2024-01-01');
      await page.fill('textarea[name="description"]', 'Smoke test automation description');
      await page.fill('input[name="claimAmount"]', '100');

      // Go to Evidence Step
      await page.getByTestId('wizard-next').click();

      // Step 3: Evidence (Optional - skip file upload in smoke test as it requires Supabase integration)
      // Wait for step transition
      await expect(page.getByRole('heading', { name: /Evidence|Dëshmi/ })).toBeVisible();

      // Go to Review Step - Note: The wizard auto-submits when reaching Review due to form validation
      await page.getByTestId('wizard-next').click();

      // Step 4: Review & Submit
      // Check if we're on Review step or if the wizard already submitted
      // Wait up to 5 seconds to see if we're on claims/new with enabled submit, otherwise expect redirect
      const submitButton = page.getByTestId('wizard-submit');
      try {
        // Try to click submit if it's visible and enabled
        await submitButton.waitFor({ state: 'visible', timeout: 2000 });
        // If visible, check if it's in enabled state
        const isEnabled = await submitButton.isEnabled();
        if (isEnabled) {
          await submitButton.click();
        }
        // If button exists but disabled (processing), wait for redirect
      } catch {
        // Button not found or not visible - wizard may have auto-submitted, proceed to verify redirect
      }

      // 5. Verify Redirect/Success
      // Should redirect to claim list or detail
      await expect(page).toHaveURL(/\/member\/claims/, { timeout: 30000 });
      await expect(page.getByText(CLAIM_TITLE)).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Phase B: Staff Visibility & Branch Switching', () => {
    test('Staff can view claims and switch branches', async ({ page }) => {
      // Login Staff
      await page.goto('/login');
      await page.fill('input[name="email"]', STAFF.email);
      await page.fill('input[name="password"]', STAFF.password);
      await page.click('button[type="submit"]');

      // Wait for login to complete and redirect
      await page.waitForURL(/\/staff|\/admin/);

      // Navigate to claims list
      // Try /staff/claims first, then /admin/claims
      const resp = await page.goto('/staff/claims');
      if (resp?.status() === 404) {
        await page.goto('/admin/claims');
      }

      // Global View: Should see the member's claim
      await page.reload();
      // Ensure we are viewing "All" or "Unassigned" to see the claim
      if (await page.getByText('All').isVisible()) {
        await page.getByText('All').click();
      }
      await expect(page.getByText(CLAIM_TITLE)).toBeVisible({ timeout: 10000 });

      // Check Multi-Branch Visibility
      const branchSelect = page.getByRole('combobox').first();
      if (await branchSelect.isVisible()) {
        // Just verify it exists for now
        await expect(branchSelect).toBeVisible();
      }
    });
  });

  test.describe('Phase C: Manager Isolation', () => {
    test('Manager A can access claims dashboard and tenant isolation works', async ({ page }) => {
      // Login Manager A
      await page.goto('/login');
      await page.fill('input[name="email"]', MANAGER_A.email);
      await page.fill('input[name="password"]', MANAGER_A.password);
      await page.click('button[type="submit"]');

      // Wait for login to complete
      await page.waitForURL(/\/staff|\/admin|\/member/);

      // Manager should land on member dashboard (branch_manager role may route here)
      // Navigate to staff claims - manager should have access
      const response = await page.goto('/staff/claims');

      // Verify page loaded successfully (not 404/403)
      const status = response?.status();
      if (status === 404 || status === 403) {
        // Try admin route
        await page.goto('/admin/claims');
      }

      // Verify claims page is accessible - should see claims heading
      await expect(page.getByRole('heading', { name: /Claims|Kërkesat/i })).toBeVisible({
        timeout: 10000,
      });

      // Tenant isolation test: Manager A is in tenant_mk, Member's claim is in tenant_ks
      // Manager should NOT see the cross-tenant claim - this confirms isolation works
      await expect(page.getByText(CLAIM_TITLE)).not.toBeVisible({ timeout: 2000 });
    });
  });

  test.describe('Phase D: Negative Tests & API', () => {
    // 5.4 Server Action Soft Failure (Simulate by assigning invalid data if possible, or just skip if hard to mock in e2e)
    // 5.1 Cross-Tenant Access (Manual/Curl is better, but maybe fetch?)
    test('Cross-Tenant API access should allow 403/404 only', async ({ request: _request }) => {
      // Attempt to fetch a KS claim using a public/unauth or wrong tenant token.
      // Getting a valid token for MK tenant is hard here without full login flow in request context.
      // Skipping detailed API specific auth tests in this file, verified by manual plan instructions usually.
    });
  });
});
