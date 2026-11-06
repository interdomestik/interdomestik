import en from '../../src/messages/en/agent.json';
import mk from '../../src/messages/mk/agent.json';
import sq from '../../src/messages/sq/agent.json';
import sr from '../../src/messages/sr/agent.json';
import { expect, test } from '../fixtures/auth.fixture';
import { getTenantFromTestInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { messagesFor } from '../utils/locale-messages';
import { gotoApp } from '../utils/navigation';
import { insertOwnedMemberLead, removeOwnedMemberLead } from '../utils/owned-member-lead';

test.describe('Agent Pro Leads (Golden)', () => {
  test('Agent can access Pro Leads worklist and see advanced columns', async ({
    agentPage: page,
  }, testInfo) => {
    const t = messagesFor({ en, mk, sq, sr }, testInfo).agent.leads_pro;
    const tenant = getTenantFromTestInfo(testInfo) === 'mk' ? 'mk' : 'ks';
    // The test owns one lead of the signed-in agent, so the worklist renders its table whatever
    // leads other tests add or remove in parallel.
    const lead = await insertOwnedMemberLead(tenant, 'e2e_pro_leads', 'Worklist');

    try {
      // The sidebar link points to /agent/leads, so that route is opened directly.
      await gotoApp(page, routes.agentLeads(testInfo), testInfo, { marker: 'agent-leads-pro' });
      await expect(page).toHaveURL(new RegExp(`.*${routes.agentLeads(testInfo)}`));

      // The router keeps a hidden copy of a revisited page, so the worklist is read where visible.
      const worklist = page.getByTestId('agent-leads-pro').filter({ visible: true });
      await expect(worklist).toBeVisible();
      await expect(worklist.getByTestId('ops-filters-bar')).toBeVisible();
      await expect(worklist.getByTestId('leads-pro-search')).toBeVisible();
      await expect(worklist.getByTestId('ops-tab-converted')).toBeVisible();

      // The Pro columns render in the page's locale, with the owned lead among the rows.
      for (const header of [t.columns.lead, t.columns.details]) {
        await expect(
          worklist.getByRole('columnheader', { name: header, exact: true })
        ).toBeVisible();
      }
      await expect(worklist.getByTestId(`lead-row-${lead.id}`)).toBeVisible();
    } finally {
      await removeOwnedMemberLead(lead);
    }
  });
});
