import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import { expect, test, TestInfo } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT-AWARE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

type Tenant = 'ks' | 'mk';

function getTenantFromTestInfo(testInfo: TestInfo): Tenant {
  return testInfo.project.name.includes('mk') ? 'mk' : 'ks';
}

function isKsProject(testInfo: TestInfo): boolean {
  return getTenantFromTestInfo(testInfo) === 'ks';
}

const DEFAULT_LOCALE = 'sq';

// Canonical users - tenant-aware
const USERS = {
  TENANT_ADMIN_MK: { email: E2E_USERS.MK_ADMIN.email, password: E2E_PASSWORD, tenant: 'tenant_mk' },
  BM_MK_A: {
    email: E2E_USERS.MK_BRANCH_MANAGER.email,
    password: E2E_PASSWORD,
    tenant: 'tenant_mk',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function loginAs(
  page: import('@playwright/test').Page,
  user: { email: string; password: string; tenant: string }
) {
  await page.goto(`/${DEFAULT_LOCALE}/login?tenantId=${user.tenant}`);
  await page.getByTestId('login-form').waitFor({ state: 'visible' });
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();

  // Wait for navigation away from login
  await page.waitForURL(/(?:member|admin|staff|agent|dashboard)/, { timeout: 30000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUARANTINE / REGRESSION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Quarantine: Regressions & Flaky Flows', () => {
  test.describe('4. Balkan Agent Flow (MK)', () => {
    test.describe.configure({ mode: 'serial' }); // Dependent steps

    // TODO: This test is stateful and creates leads - not suitable for smoke runs
    test('@quarantine Regression: Agent can create lead and initiate cash payment', async ({
      page,
    }, testInfo) => {
      // This test is MK-tenant-specific
      test.skip(isKsProject(testInfo), 'MK-only test');

      await loginAs(page, {
        email: 'agent.balkan.1@interdomestik.com',
        password: E2E_PASSWORD,
        tenant: 'tenant_mk',
      });

      await page.goto(`/${DEFAULT_LOCALE}/agent/leads`);
      await page.waitForLoadState('networkidle');

      // Verify Seeded Lead is visible
      await expect(page.getByText('lead.balkan@example.com')).toBeVisible();

      // Create New Lead
      const newLeadBtn = page.getByRole('button', { name: /New Lead|Lead i Ri/i }).first();
      await newLeadBtn.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -100)); // Clear sticky header
      await newLeadBtn.click({ force: true });
      // Use more robust dialog selector
      await page.waitForSelector('div[role="dialog"], dialog[open]', {
        state: 'visible',
        timeout: 20000,
      });

      const newEmail = `smoke.balkan.${Date.now()}@test.com`;
      await page.locator('input[name="firstName"]').fill('Smoke');
      await page.locator('input[name="lastName"]').fill('Test');
      await page.locator('input[name="email"]').fill(newEmail);
      await page.locator('input[name="phone"]').fill('+38970888888');
      await page.locator('button[type="submit"]').first().click({ force: true });

      // Wait for dialog to close and backdrop to clear
      await expect(page.locator('div[role="dialog"], dialog[open]')).toBeHidden({ timeout: 15000 });
      await expect(page.locator('.fixed.inset-0.bg-black\\/80')).toBeHidden({ timeout: 15000 });

      // Wait for reload to pick up the new lead
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(newEmail)).toBeVisible({ timeout: 20000 });

      // Initiate Cash Payment for new lead
      const row = page.getByRole('row').filter({ hasText: newEmail }).first();
      await row.scrollIntoViewIfNeeded();

      // On mobile, the actions might be in a dropdown or just need a forced click
      const actionBtn = page
        .getByRole('row')
        .filter({ hasText: newEmail })
        .first()
        .getByRole('button', { name: /Veprimet|Actions/i })
        .or(page.getByRole('row').filter({ hasText: newEmail }).first().getByRole('button').last());
      await actionBtn.click({ force: true });
      await page
        .getByRole('row')
        .filter({ hasText: newEmail })
        .first()
        .getByRole('button', { name: /Cash/i })
        .click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('row').filter({ hasText: newEmail }).first()).toContainText(
        /Pending/i
      );
    });

    // TODO: Rewrite - UI removed data-testid="cash-verification-row" and "cash-approve"
    test('@quarantine Regression: Branch Manager can verify cash payment', async ({
      page,
    }, testInfo) => {
      // This test is MK-tenant-specific
      test.skip(isKsProject(testInfo), 'MK-only test');

      await loginAs(page, USERS.BM_MK_A);

      await page.goto(`/${DEFAULT_LOCALE}/admin/leads`);

      const row = page
        .getByTestId('cash-verification-row')
        .filter({ hasText: 'lead.balkan@example.com' });
      await expect(row).toBeVisible();
      await row.getByTestId('cash-approve').click();

      await expect(page.getByText(/Payment rejected|Pagesa u verifikua/i)).toBeVisible();
      // Should disappear or change status
    });
  });

  test.describe('6. Cash Verification v2', () => {
    // TODO: Rewrite - UI removed data-testid="cash-verification-row"
    test('@quarantine Regression: Cash Ops: Verification queue loads and allows processing', async ({
      page,
    }) => {
      // 1. Login as Tenant Admin (Sees all)
      await loginAs(page, USERS.TENANT_ADMIN_MK);

      // 2. Navigate to Leads page
      await page.goto(`/${DEFAULT_LOCALE}/admin/leads`);
      await page.waitForLoadState('networkidle');

      // 3. VERIFY ROUTING: Check Page Title matches "Verifikimi i Pagesave"
      // This explicitly confirms we are NOT on the Claims page ("Menaxhimi i Kërkesave...")
      await expect(
        page.getByRole('heading', { name: /Verifikimi|Payment Verification/i })
      ).toBeVisible();

      // 4. Content Check (Row OR Empty State)
      const emptyState = page.getByText(/No pending cash verification requests/i);
      const rows = page.locator('[data-testid="cash-verification-row"]');

      if ((await rows.count()) > 0) {
        // Active Flow
        const firstRow = rows.first();
        await expect(firstRow).toBeVisible();
        await expect(firstRow).toContainText('MK-');

        // Reject Flow
        const countBefore = await rows.count();
        await firstRow.locator('[data-testid="cash-reject"]').click({ force: true });
        await expect(page.getByText(/Payment rejected/i)).toBeVisible();
        await expect(rows).toHaveCount(countBefore - 1);
      } else {
        // Empty State Flow (Routing Verified via Title)
        await expect(emptyState).toBeVisible();
      }
    });
  });
});
