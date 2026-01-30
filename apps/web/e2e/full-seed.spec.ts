import { expect, test } from '@playwright/test';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

// Credentials from e2e seed (golden baseline)
const PASSWORD = 'GoldenPass123!';
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
  testInfo: import('@playwright/test').TestInfo
) {
  const baseURL = testInfo.project.use.baseURL || 'http://localhost:3000';
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

  if (user.email.includes('admin') || user.email.includes('super')) {
    await gotoApp(page, routes.admin(testInfo), testInfo, { marker: 'dashboard-page-ready' });
    return;
  }

  if (user.email.includes('agent')) {
    await gotoApp(page, routes.agent(testInfo), testInfo, { marker: 'dashboard-page-ready' });
    return;
  }

  if (user.email.includes('staff')) {
    await gotoApp(page, routes.staff(testInfo), testInfo, { marker: 'dashboard-page-ready' });
    return;
  }

  await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'dashboard-page-ready' });
}

test.describe('Full System Seed Smoke Tests', () => {
  // 1. Super Admin: Tenant-scoped branches (current behavior)
  test('Super Admin sees MK branches only', async ({ page }, testInfo) => {
    await loginAs(page, USERS.super, testInfo);

    await gotoApp(page, routes.adminBranches(testInfo), testInfo, { marker: 'page-ready' });
    await expect(page.getByText('MK-A', { exact: true })).toBeVisible();
    await expect(page.getByText('MK-B', { exact: true })).toBeVisible();
    await expect(page.getByText('KS-A')).not.toBeVisible();
  });

  // 2. Tenant Admin: Staff list is tenant-scoped
  test('MK Admin sees MK staff only', async ({ page }, testInfo) => {
    await loginAs(page, USERS.mk_admin, testInfo);

    await gotoApp(page, `${routes.adminUsers(testInfo)}?role=admin,staff`, testInfo, {
      marker: 'page-ready',
    });
    await expect(page.getByText('staff.mk@interdomestik.com')).toBeVisible();
    await expect(page.getByText('staff.ks@interdomestik.com')).not.toBeVisible();
  });

  // 3. Staff: Claim Visibility & Isolation
  test.fixme('MK Staff sees MK Claims but not KS Claims', async ({ page }, testInfo) => {
    await loginAs(page, USERS.mk_staff, testInfo);

    await gotoApp(page, routes.staffClaims(testInfo), testInfo, { marker: 'page-ready' });
    // Verify at least one claim is visible (robust against localization)
    await expect(page.getByTestId('claim-operational-card').first()).toBeVisible({
      timeout: 10000,
    });
    // Negative check for KS isolation (KS-A string likely universally present in KS claim titles/IDs if visible)
    await expect(page.getByText('KS-A')).not.toBeVisible();
  });

  // 4. Agent: Balkan Agent Flow Data
  test('MK Agent sees seeded Balkan lead', async ({ page }, testInfo) => {
    await loginAs(page, USERS.mk_agent_balkan, testInfo);

    await gotoApp(page, routes.agentLeads(testInfo), testInfo, { marker: 'page-ready' });
    const row = page.getByTestId('lead-row-golden_lead_balkan');
    await expect(row).toBeVisible();
    // Use robust status attribute check (case-insensitive regex)
    await expect(row.getByTestId('ops-status-badge')).toHaveAttribute('data-status', /pending/i);
  });
});
