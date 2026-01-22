import { db, E2E_USERS, eq, memberLeads, user } from '@interdomestik/database';
import { OPS_TEST_IDS } from '../../src/components/ops/testids';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Leads Drawer (Golden)', () => {
  test('Agent can view lead details via drawer', async ({ agentPage: page }, testInfo) => {
    // 1. Seed lead for this specific test run
    const tenant = testInfo.project.name.includes('mk') ? 'mk' : 'ks';
    const agentEmail = tenant === 'mk' ? E2E_USERS.MK_AGENT.email : E2E_USERS.KS_AGENT.email;
    const testEmail = `drawer-test-${tenant}-${Date.now()}-${Math.random()}@example.com`;

    const agent = await db.query.user.findFirst({
      where: eq(user.email, agentEmail),
    });

    if (agent) {
      await db.insert(memberLeads).values({
        id: `lead-drawer-${Date.now()}-${Math.random()}`,
        tenantId: agent.tenantId,
        branchId: agent.branchId!,
        agentId: agent.id,
        firstName: 'Drawer',
        lastName: 'Test',
        email: testEmail,
        phone: '1234567890',
        status: 'new',
      });
    }

    // 2. Navigate to Leads
    await gotoApp(page, routes.agentLeads(testInfo), testInfo, { marker: 'agent-leads-lite' });

    // 3. Locate our specific seeded row
    await expect(page.getByTestId(OPS_TEST_IDS.TABLE.ROOT)).toBeVisible();
    const row = page.locator(`[data-testid^="lead-row-"]`).filter({ hasText: testEmail }).first();
    await expect(row).toBeVisible({ timeout: 15000 });

    // 4. Click Row -> Verify URL
    await row.click();
    await expect(page).toHaveURL(/selected=/);

    // 5. Verify Drawer Opens
    const drawer = page.getByTestId(OPS_TEST_IDS.DRAWER);
    await expect(drawer).toBeVisible();

    // 6. Verify Content
    await expect(drawer.getByText(/Status/i)).toBeVisible({ timeout: 10000 });
    await expect(drawer.getByTestId('lead-created-at')).toBeVisible();

    // 7. Verify Actions section
    await expect(drawer.getByTestId('agent-lead-next-step')).toBeVisible();

    // 8. Close Drawer (Using Escape for maximum reliability with Sheets)
    await page.keyboard.press('Escape');

    // Verify URL does not have selected param
    await expect(page).not.toHaveURL(/selected=/);
    await expect(drawer).not.toBeVisible();
  });
});
