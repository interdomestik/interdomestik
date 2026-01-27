import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Daily Focus (Gate)', () => {
  test('Daily Focus widget prioritizes Follow-ups', async ({ page, loginAs }, testInfo) => {
    // 1. Login as Agent
    await loginAs('agent_lite');

    // 2. Navigate to Dashboard (default view likely contains the widget)
    // We navigate to /agent explicitly to be safe, or just rely on login landing page.
    // Dashboard is usually at /agent or /agent/dashboard. based on AgentDashboardLite usage, it's likely the home.
    await gotoApp(page, '/agent', testInfo, { marker: 'agent-home' });

    // 3. Dashboard should show "Priority Focus" (Follow-ups)
    // The seed data has pending follow-ups (e.g. golden_ks_member_followup_1)
    const dailyFocus = page.getByTestId('daily-focus-card-followup');

    // Explicit wait/expect
    await expect(dailyFocus).toBeVisible();

    // Check specific action button
    const actionBtn = page.getByTestId('daily-focus-action');
    await expect(actionBtn).toBeVisible();
    // It should link to follow-ups
    await expect(actionBtn).toHaveAttribute('href', /.*\/agent\/follow-ups/);
  });
});
