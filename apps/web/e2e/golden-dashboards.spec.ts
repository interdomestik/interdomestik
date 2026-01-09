import { expect, test } from '@playwright/test';

// Credentials from seed-platform-verification.mjs
const PASSWORD = 'VerifyPassword123!';
const SUPER_ADMIN = { email: 'super@verify.com', password: PASSWORD };
const TENANT_ADMIN = { email: 'admin.tenant_ks@verify.com', password: PASSWORD };
const BRANCH_MANAGER = { email: 'manager.branch_ks_a@verify.com', password: PASSWORD };

test.describe('Golden Dashboards Verification', () => {
  // 1. Super Admin: Global View
  test('Super Admin sees Global Dashboard and can access Branches', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[name="email"]', SUPER_ADMIN.email);
    await page.fill('input[name="password"]', SUPER_ADMIN.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/);

    // Verify Global Stats
    await expect(page.getByText('Total Revenue')).toBeVisible();
    await expect(page.getByText('Total Claims')).toBeVisible();
    // Should not be limited to a tenant title (or shows "All Tenants" if implemented)

    // Verify Branch Management Access
    await page.goto('/admin/branches');
    await expect(page.getByText('Branches')).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Branch/i })).toBeVisible();
  });

  // 2. Tenant Admin: Tenant Scoped View
  test('Tenant Admin sees Tenant Dashboard', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[name="email"]', TENANT_ADMIN.email);
    await page.fill('input[name="password"]', TENANT_ADMIN.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/);

    // Verify Tenant Specifics
    // Assuming Tenant Admin dashboard looks similar but scoped
    await expect(page.getByText('Total Revenue')).toBeVisible();

    // Verify Branch Management Access
    await page.goto('/admin/branches');
    await expect(page.getByText('Branches')).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Branch/i })).toBeVisible();
  });

  // 3. Branch Manager: Branch Scoped View
  test('Branch Manager is redirected to Branch Dashboard', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[name="email"]', BRANCH_MANAGER.email);
    await page.fill('input[name="password"]', BRANCH_MANAGER.password);
    await page.click('button[type="submit"]');

    // Should eventually land on /admin/branches/[id] or be capable of navigating there
    // The middleware or page logic might redirect immediately or landing on /admin
    // Check where we end up. Current logic redirects BM from /admin/branches to /admin/branches/[id]

    await page.waitForURL(/\/admin\/branches\/branch_ks_a/);

    // Verify Branch Stats
    await expect(page.getByText('Branch Revenue')).toBeVisible();
    // Or specific branch header
    await expect(page.getByText('Prishtina Branch')).toBeVisible();

    // Verify Capture of Restricted Actions (Optional, if "Create Branch" is only for higher roles)
    // If BM tries to go to /admin/branches (list), they should be redirected back
    await page.goto('/admin/branches');
    await expect(page).toHaveURL(/\/admin\/branches\/branch_ks_a/);
  });
});
