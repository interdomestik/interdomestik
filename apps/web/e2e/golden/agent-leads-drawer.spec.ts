import { db, eq, memberLeads } from '@interdomestik/database';
import { OPS_TEST_IDS } from '../../src/components/ops/testids';
import en from '../../src/messages/en/agent.json';
import mk from '../../src/messages/mk/agent.json';
import sq from '../../src/messages/sq/agent.json';
import sr from '../../src/messages/sr/agent.json';
import { expect, test } from '../fixtures/auth.fixture';
import { getTenantFromTestInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { messagesFor } from '../utils/locale-messages';
import { gotoApp } from '../utils/navigation';
import { insertOwnedMemberLead } from '../utils/owned-member-lead';

test.describe('Agent Leads Drawer (Golden)', () => {
  test('Agent can view lead details via drawer', async ({ agentPage: page }, testInfo) => {
    const t = messagesFor({ en, mk, sq, sr }, testInfo).agent.leads_pro;
    const tenant = getTenantFromTestInfo(testInfo) === 'mk' ? 'mk' : 'ks';
    // The test owns one lead of the signed-in agent and removes it afterwards.
    const { id: leadId } = await insertOwnedMemberLead(tenant, 'e2e_lead_drawer', 'Drawer');

    try {
      await gotoApp(page, routes.agentLeads(testInfo), testInfo, { marker: 'agent-leads-pro' });
      // The router keeps a hidden copy of a revisited page, so the table is read where visible.
      const table = page.getByTestId(OPS_TEST_IDS.TABLE.ROOT).filter({ visible: true });
      await expect(table).toBeVisible();
      const row = table.locator(`[data-testid="lead-row-${leadId}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });

      await row.click();
      await expect(page).toHaveURL(/selected=/);
      const drawer = page.getByTestId(OPS_TEST_IDS.DRAWER);
      await expect(drawer).toBeVisible();
      await expect(drawer.getByText(t.fields.status, { exact: true })).toBeVisible();
      await expect(drawer.getByTestId('lead-created-at')).toBeVisible();
      await expect(drawer.getByTestId('agent-lead-next-step')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page).not.toHaveURL(/selected=/);
      await expect(drawer).not.toBeVisible();
    } finally {
      await db.delete(memberLeads).where(eq(memberLeads.id, leadId));
    }
  });
});
