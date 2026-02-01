/**
 * Agent User Flow E2E Tests
 *
 * Agent portal focuses on sales: CRM, leads, clients, commissions.
 */

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Agent User Flow', () => {
  test('Agent can access agent workspace', async ({ agentPage: page }, testInfo) => {
    await gotoApp(page, routes.agent(), testInfo);
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent');
  });

  test('Agent can access CRM dashboard', async ({ agentPage: page }, testInfo) => {
    await gotoApp(page, routes.agentCrm(), testInfo);
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent/crm');
  });

  test('Agent can access leads', async ({ agentPage: page }, testInfo) => {
    await gotoApp(page, routes.agentLeads(), testInfo);
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent/leads');
  });

  test('Agent can access clients', async ({ agentPage: page }, testInfo) => {
    await gotoApp(page, routes.agentClients(), testInfo);
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent/clients');
  });

  test('Agent can access commissions', async ({ agentPage: page }, testInfo) => {
    await gotoApp(page, routes.agentCommissions(), testInfo);
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent/commissions');
  });
});
