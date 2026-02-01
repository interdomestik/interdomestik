import { expect, test, type TestInfo } from '@playwright/test';
import { gotoApp } from './utils/navigation';

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
  user: { email: string; tenant?: string },
  testInfo: TestInfo
) {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const origin = new URL(baseURL).origin;
  const loginURL = `${origin}/api/auth/sign-in/email`;

  const res = await page.request.post(loginURL, {
    data: { email: user.email, password: PASSWORD },
    headers: {
      Origin: origin,
      Referer: `${origin}/login`,
    },
  });

  if (!res.ok()) {
    throw new Error(`API login failed for ${user.email}: ${res.status()} ${await res.text()}`);
  }

  const locale = DEFAULT_LOCALE;
  let targetPath = `/${locale}`;
  if (user.email.includes('admin') || user.email.includes('super')) targetPath += '/admin';
  else if (user.email.includes('agent')) targetPath += '/agent';
  else if (user.email.includes('staff')) targetPath += '/staff';
  else targetPath += '/member';

  await gotoApp(page, targetPath, testInfo, { marker: 'domcontentloaded' });
}

test.describe.skip('Full System Seed Smoke Tests ', () => {
  // 1. Super Admin: Tenant-scoped branches (current behavior)
  test('Super Admin sees MK branches only', async ({ page }, testInfo) => {
    await loginAs(page, USERS.super, testInfo);

    await expect(page).toHaveURL(/\/admin/);
    await gotoApp(page, `/${DEFAULT_LOCALE}/admin/branches`, testInfo);
    await expect(page.getByText('MK-A', { exact: true })).toBeVisible();
    await expect(page.getByText('MK-B', { exact: true })).toBeVisible();
    await expect(page.getByText('KS-A')).not.toBeVisible();
  });

  // 2. Tenant Admin: Staff list is tenant-scoped
  test('MK Admin sees MK staff only', async ({ page }, testInfo) => {
    await loginAs(page, USERS.mk_admin, testInfo);

    await expect(page).toHaveURL(/\/admin/);
    await gotoApp(page, `/${DEFAULT_LOCALE}/admin/users?role=admin,staff`, testInfo);
    await expect(page.getByText('staff.mk@interdomestik.com')).toBeVisible();
    await expect(page.getByText('staff.ks@interdomestik.com')).not.toBeVisible();
  });

  // 3. Staff: Claim Visibility & Isolation
  test('MK Staff sees MK Claims but not KS Claims', async ({ page }, testInfo) => {
    await loginAs(page, USERS.mk_staff, testInfo);

    await gotoApp(page, `/${DEFAULT_LOCALE}/staff/claims`, testInfo);
    await expect(page.getByText('Rear ended in Skopje (Baseline)')).toBeVisible(); // MK Claim
    await expect(page.getByText('KS-A SUBMITTED Claim 1')).not.toBeVisible(); // KS Claim
  });

  // 4. Agent: Balkan Agent Flow Data
  test('MK Agent sees seeded Balkan lead', async ({ page }, testInfo) => {
    await loginAs(page, USERS.mk_agent_balkan, testInfo);

    await gotoApp(page, `/${DEFAULT_LOCALE}/agent/leads`, testInfo);
    const row = page.getByRole('row').filter({ hasText: 'lead.balkan@example.com' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Pending');
  });
});
