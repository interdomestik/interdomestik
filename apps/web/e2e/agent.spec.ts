import { expect, test } from './fixtures/auth.fixture';

test.describe('Agent Role Access', () => {
  test('Agent is redirected away from staff claims queue', async ({ agentPage: page }) => {
    await page.goto('/en/staff/claims');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).not.toContain('/staff/claims');
  });
});
