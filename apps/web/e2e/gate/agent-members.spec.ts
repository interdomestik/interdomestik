import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Members List (Gate)', () => {
  test('Agent Pro sees exactly their assigned members (Isolation)', async ({
    page,
    loginAs,
  }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    const tenant = isMK ? 'mk' : 'ks';

    // 1. Login as Agent
    await loginAs('agent');

    // 2. Navigate to Members using strict navigation helper (Pro is default)
    await gotoApp(page, '/agent/members', testInfo, { marker: 'agent-members-pro-page-ready' });

    // 3. Verify Isolation based on Tenant
    if (tenant === 'ks') {
      // KS Agent should see exactly 2 members
      const rows = page.locator('[data-testid^="agent-member-row-"]');
      await expect(rows).toHaveCount(2);

      await expect(page.getByTestId('agent-member-row-golden_ks_a_member_1')).toBeVisible();
      await expect(page.getByTestId('agent-member-row-golden_ks_a_member_2')).toBeVisible();

      // Should NOT see MK members
      await expect(page.getByTestId('agent-member-row-golden_mk_member_1')).not.toBeVisible();
    } else {
      // MK Agent should see exactly 1 member
      const rows = page.locator('[data-testid^="agent-member-row-"]');
      await expect(rows).toHaveCount(1);

      await expect(page.getByTestId('agent-member-row-golden_mk_member_1')).toBeVisible();

      // Should NOT see KS members
      await expect(page.getByTestId('agent-member-row-golden_ks_a_member_1')).not.toBeVisible();
    }
  });

  test('Agent Lite sees assigned members', async ({ page, loginAs }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    const tenant = isMK ? 'mk' : 'ks';

    await loginAs('agent');
    await gotoApp(page, '/agent/members/lite', testInfo, {
      marker: 'agent-members-lite-page-ready',
    });

    if (tenant === 'ks') {
      await expect(page.getByTestId('agent-member-row-golden_ks_a_member_1')).toBeVisible();
      await expect(page.getByTestId('agent-member-row-golden_ks_a_member_2')).toBeVisible();
    } else {
      await expect(page.getByTestId('agent-member-row-golden_mk_member_1')).toBeVisible();
    }
  });

  test('Agent Pro search filters members', async ({ page, loginAs }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    // Only run search test on KS where we have multiple members to filter
    if (isMK) return;

    await loginAs('agent');
    await gotoApp(page, '/agent/members', testInfo, { marker: 'agent-members-pro-page-ready' });

    // Search for Member 1
    const searchInput = page.getByTestId('agent-members-search-input');
    await searchInput.fill('Member 1');

    // Wait for debounce and reload
    await expect(page.getByTestId('agent-member-row-golden_ks_a_member_2')).not.toBeVisible();
    await expect(page.getByTestId('agent-member-row-golden_ks_a_member_1')).toBeVisible();
  });

  test('Navigation from dashboard tile to members page', async ({ page, loginAs }, testInfo) => {
    // 1. Login as Agent
    await loginAs('agent');

    // 2. Go to home
    await gotoApp(page, '/agent', testInfo, { marker: 'agent-home' });

    // 3. Click the members tile
    await page.getByTestId('agent-tile-my-members').click();

    // 4. Assert page ready (Pro)
    await expect(page.getByTestId('agent-members-pro-page-ready')).toBeVisible();
  });

  test('SQ Leads page has correct localized heading', async ({ page, loginAs }, testInfo) => {
    // This test is only relevant for SQ locale
    if (!testInfo.project.name.includes('sq')) return;

    await loginAs('agent');
    await gotoApp(page, '/agent/leads', testInfo, { marker: 'agent-leads-lite' });

    // Check heading
    const heading = page.getByTestId('agent-leads-title');
    await expect(heading).toHaveText('Anëtarët potencial');
  });

  test('Agent can navigate to member profile', async ({ page, loginAs }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    // const tenant = isMK ? 'mk' : 'ks';
    const memberId = isMK ? 'golden_mk_member_1' : 'golden_ks_a_member_1';

    await loginAs('agent');
    await gotoApp(page, '/agent/members', testInfo, { marker: 'agent-members-pro-page-ready' });

    // Click the view profile button for the specific member
    await page.getByTestId(`view-profile-${memberId}`).click();

    // Assert navigation to profile
    await expect(page.getByTestId('agent-client-profile-page')).toBeVisible();
  });
});
