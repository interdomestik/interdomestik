import { expect, test } from '../fixtures/auth.fixture';

test.describe('Agent Follow-ups (Golden)', () => {
  test('Agent can view due follow-ups count and list', async ({ page, loginAs }) => {
    // 1. Login as KS Agent
    await loginAs('agent');

    // 2. Land on /agent
    await expect(page).toHaveURL(/\/agent/);
    await page.waitForLoadState('domcontentloaded');

    // 3. Verify Home Page Content
    const agentHome = page.getByTestId('agent-home');
    await expect(agentHome).toBeVisible({ timeout: 10000 });

    // 4. Check Follow-ups Count (Should be 1 seeded lead)
    const followUpsCount = page.getByTestId('my-followups-count');
    await expect(followUpsCount).toBeVisible();
    await expect(followUpsCount).toHaveText('1');

    // 5. Navigate to Follow-ups Page
    const followUpsLink = page.getByTestId('my-followups-link');
    await followUpsLink.click();
    await page.waitForLoadState('domcontentloaded');

    // 6. Verify Follow-ups Page
    await expect(page).toHaveURL(/\/agent\/follow-ups/);
    await expect(page.getByTestId('agent-followups-page-ready')).toBeVisible();

    // 7. Verify Seeded Item
    const items = page.getByTestId('followups-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('FollowUp');
    await expect(items.first()).toContainText(/Due (KS|MK)/);
  });
});
