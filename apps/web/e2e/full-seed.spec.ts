import { expect, test } from '@playwright/test';

// Credentials from e2e seed (golden baseline)
const PASSWORD = 'GoldenPass123!';
const DEFAULT_LOCALE = 'sq';
const USERS = {
  super: { email: 'super@interdomestik.com', tenant: 'tenant_mk' },
  mk_admin: { email: 'admin.mk@interdomestik.com', tenant: 'tenant_mk' },
  ks_admin: { email: 'admin.ks@interdomestik.com', tenant: 'tenant_ks' },
  mk_staff: { email: 'staff.mk@interdomestik.com', tenant: 'tenant_mk' },
  mk_agent_balkan: { email: 'agent.balkan.1@interdomestik.com', tenant: 'tenant_mk' },
};

async function loginAs(
  page: import('@playwright/test').Page,
  user: { email: string; tenant?: string }
) {
  const tenantQuery = user.tenant ? `?tenantId=${user.tenant}` : '';
  await page.goto(`/${DEFAULT_LOCALE}/login${tenantQuery}`);
  await page.getByTestId('login-form').waitFor({ state: 'visible' });
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/(?:member|admin|staff|agent|dashboard)/, { timeout: 30000 });
}

test.describe('Full System Seed Smoke Tests ', () => {
  // 1. Super Admin: Tenant-scoped branches (current behavior)
  test('Super Admin sees MK branches only', async ({ page }) => {
    await loginAs(page, USERS.super);

    await expect(page).toHaveURL(/\/admin/);
    await page.goto(`/${DEFAULT_LOCALE}/admin/branches`);
    await expect(page.getByText('MK-A', { exact: true })).toBeVisible();
    await expect(page.getByText('MK-B', { exact: true })).toBeVisible();
    await expect(page.getByText('KS-A')).not.toBeVisible();
  });

  // 2. Tenant Admin: Staff list is tenant-scoped
  test('MK Admin sees MK staff only', async ({ page }) => {
    await loginAs(page, USERS.mk_admin);

    await expect(page).toHaveURL(/\/admin/);
    await page.goto(`/${DEFAULT_LOCALE}/admin/users?role=admin,staff`);
    await expect(page.getByText('staff.mk@interdomestik.com')).toBeVisible();
    await expect(page.getByText('staff.ks@interdomestik.com')).not.toBeVisible();
  });

  // 3. Staff: Claim Visibility & Isolation
  test('MK Staff sees MK Claims but not KS Claims', async ({ page }) => {
    await loginAs(page, USERS.mk_staff);

    await page.goto(`/${DEFAULT_LOCALE}/staff/claims`);
    await expect(page.getByText('Rear ended in Skopje (Baseline)')).toBeVisible(); // MK Claim
    await expect(page.getByText('KS-A SUBMITTED Claim 1')).not.toBeVisible(); // KS Claim
  });

  // 4. Agent: Balkan Agent Flow Data
  test('MK Agent sees seeded Balkan lead', async ({ page }) => {
    await loginAs(page, USERS.mk_agent_balkan);

    await page.goto(`/${DEFAULT_LOCALE}/agent/leads`);
    const row = page.getByRole('row').filter({ hasText: 'lead.balkan@example.com' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Pending');
  });
});
