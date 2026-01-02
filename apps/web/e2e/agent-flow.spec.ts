/**
 * Agent User Flow E2E Tests
 *
 * Agent portal focuses on sales: CRM, leads, clients, commissions.
 */

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

test.describe('Agent User Flow', () => {
  test('Agent can access agent workspace', async ({ agentPage: page }) => {
    await page.goto(routes.agent());
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent');
  });

  test('Agent can access CRM dashboard', async ({ agentPage: page }) => {
    await page.goto(routes.agentCrm());
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent/crm');
  });

  test('Agent can access leads', async ({ agentPage: page }) => {
    await page.goto(routes.agentLeads());
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent/leads');
  });

  test('Agent can access deals', async ({ agentPage: page }) => {
    await page.goto(routes.agentDeals());
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent/deals');
    await expect(page.getByRole('heading', { name: 'Deals' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'No deals created yet.' }).first()).toBeVisible();
  });

  test('Agent can access clients', async ({ agentPage: page }) => {
    await page.goto(routes.agentClients());
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent/clients');
  });

  test('Agent can access commissions', async ({ agentPage: page }) => {
    await page.goto(routes.agentCommissions());
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent/commissions');
  });
});
