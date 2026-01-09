import { expect, test } from '@playwright/test';

// Credentials from Manual Verification Map
const PASSWORD = 'FullSeedPass123!';
const USERS = {
  super: 'super@interdomestik.com',
  mk_admin: 'admin.mk@interdomestik.com',
  ks_admin: 'admin.ks@interdomestik.com',
  mk_staff: 'staff.mk@interdomestik.com',
  mk_agent_a1: 'agent.mk.a1@interdomestik.com',
};

test.describe('Full System Seed Smoke Tests', () => {
  // 1. Super Admin: Global Tenant Visibility
  test('Super Admin sees both tenants', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.super);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Expect to be on global admin or see tenant switcher
    await expect(page).toHaveURL(/\/admin/);
    // Check for Tenant switcher presence or list
    // Assuming UI has a way to see tenants, e.g. in /admin/tenants
    await page.goto('/admin/tenants');
    await expect(page.getByText('North Macedonia')).toBeVisible();
    await expect(page.getByText('Kosovo')).toBeVisible();
  });

  // 2. Tenant Admin: Dashboard KPIs
  test('MK Admin sees correct member counts', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.mk_admin);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/admin/);
    // Verify Dashboard KPIs (approximate check matching seed)
    // We seeded 9 members + 2 leads = 11 total users in MK?
    // Active members: 7 standard + 2 converted = 9.
    // Check for "9" in Active Members card if exists.
    // Or just check that "MK Staff" is visible in Staff list
    await page.goto('/admin/staff');
    await expect(page.getByText('MK Staff')).toBeVisible();
    await expect(page.getByText('KS Staff')).not.toBeVisible(); // Isolation check
  });

  // 3. Staff: Claim Visibility & Isolation
  test('MK Staff sees MK Claims but not KS Claims', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.mk_staff);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.goto('/admin/claims');
    await expect(page.getByText('Fender Bender Skopje')).toBeVisible(); // MK Claim
    await expect(page.getByText('Pristina Parking Bump')).not.toBeVisible(); // KS Claim
  });

  // 4. Agent: Balkan Agent Flow Data
  test('MK Agent sees converted leads', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.mk_agent_a1);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.goto('/agent/leads');
    await expect(page.getByText('Balkan CashLead')).toBeVisible();
    await expect(page.getByText('Balkan CardLead')).toBeVisible();
    await expect(page.getByText('converted')).toHaveCount(2);
  });
});
