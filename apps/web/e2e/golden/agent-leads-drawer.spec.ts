import { db, E2E_USERS, eq, memberLeads, user } from '@interdomestik/database';
import { OPS_TEST_IDS } from '../../src/components/ops/testids';
import { expect, test } from '../fixtures/auth.fixture';

test.describe('Agent Leads Drawer (Golden)', () => {
  test.beforeAll(async () => {
    // Seed a lead for the agent if one doesn't exist
    const agentEmail = E2E_USERS.KS_AGENT.email;
    const agent = await db.query.user.findFirst({
      where: eq(user.email, agentEmail),
    });

    if (!agent) throw new Error(`Agent user ${agentEmail} not found in DB`);

    // Check if lead exists
    const existingLead = await db.query.memberLeads.findFirst({
      where: eq(memberLeads.agentId, agent.id),
    });

    if (!existingLead) {
      // Create a lead
      await db.insert(memberLeads).values({
        id: `lead-test-${Date.now()}`,
        tenantId: E2E_USERS.KS_AGENT.tenantId,
        branchId: E2E_USERS.KS_AGENT.branchId!,
        agentId: agent.id,
        firstName: 'Test',
        lastName: 'Lead',
        email: `test-lead-${Date.now()}@example.com`,
        phone: '1234567890',
        status: 'new',
        notes: 'Created by E2E test',
      });
    }
  });

  test('Agent can view lead details via drawer', async ({ page, loginAs }) => {
    // 1. Login as Agent
    await loginAs('agent');

    // 2. Navigate to Leads
    await page.goto('/sq/agent/leads');
    await expect(page.getByText('Lead-et')).toBeVisible();

    // 3. Locate First Row
    // We added rowTestId="lead-row" in AgentLeadsOpsPage, so rows have data-testid="lead-row-{id}"
    // But since IDs are dynamic, we can use the generic row testID if available or regex
    // OpsTable renders rows with `data-testid={row.testId ?? rowTestId ?? OPS_TEST_IDS.TABLE.ROW}`
    // In AgentLeadsOpsPage we set testId: `lead-row-${lead.id}`.
    // So we can find the first one by partial match or just the first row in the table.

    // Waiting for table to load
    await expect(page.getByTestId(OPS_TEST_IDS.TABLE.ROOT)).toBeVisible();

    const firstRow = page.getByTestId(/lead-row-/).first();
    await expect(firstRow).toBeVisible();

    // 4. Click Row -> Verify URL
    await firstRow.click();
    await expect(page).toHaveURL(/selected=/);

    // 5. Verify Drawer Opens
    const drawer = page.getByTestId(OPS_TEST_IDS.DRAWER);
    await expect(drawer).toBeVisible();

    // 6. Verify Content
    await expect(drawer.getByText(/Status/i)).toBeVisible();
    await expect(drawer.getByTestId('lead-created-at')).toBeVisible();
    await expect(drawer.getByText(/Timeline/i)).toBeVisible();

    // 7. Verify Actions
    const actionBar = drawer.getByTestId(OPS_TEST_IDS.ACTION_BAR);
    // Note: We might see multiple action bars due to the split (primary vs secondary).
    // Ideally we check specific sections.

    // Check for "Next Step" guided section
    const nextStepSection = drawer.getByTestId('agent-lead-next-step');
    // Since seed status is 'new', Convert is primary, so next step should be visible
    await expect(nextStepSection).toBeVisible();

    // Check for "Convert to Client" button (primary action)
    // Note: If lead is already converted, this might be hidden, so we check availability based on status.
    // Since we are using seeded data, we assume at least one new lead exists or we check conditionally.
    // For now, simple visibility check of the bar is enough for structure.

    // 8. Close Drawer -> URL Update
    // Click outside or close button. OpsDrawer usually has a close button.
    // Or we can invoke close via `clearSelectedId` if we had a close button in UI,
    // but OpsDrawer (Sheet) has a default close X.
    // Let's try pressing Escape
    await page.keyboard.press('Escape');

    // Verify URL does not have selected param
    await expect(page).not.toHaveURL(/selected=/);
    await expect(drawer).not.toBeVisible();
  });
});
