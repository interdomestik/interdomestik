/**
 * Agent User Flow E2E Tests
 *
 * Agent portal focuses on sales: CRM, leads, clients, commissions.
 */

import { expect, test } from './fixtures/auth.fixture';

test.describe('Agent User Flow', () => {
  test('Agent can access agent workspace', async ({ agentPage: page }) => {
    await page.goto('/en/agent');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent');
  });

  test('Agent can access CRM dashboard', async ({ agentPage: page }) => {
    await page.goto('/en/agent/crm');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent/crm');
  });

  test('Agent can access leads', async ({ agentPage: page }) => {
    await page.goto('/en/agent/leads');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent/leads');
  });

  test('Agent can access clients', async ({ agentPage: page }) => {
    await page.goto('/en/agent/clients');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent/clients');
  });

  test('Agent can access commissions', async ({ agentPage: page }) => {
    await page.goto('/en/agent/commissions');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/agent/commissions');
  });
});
