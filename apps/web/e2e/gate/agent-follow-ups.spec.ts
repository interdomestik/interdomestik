import { db, eq, memberFollowups } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Follow-ups (Gate)', () => {
  // Serial mode to ensure no interference between tests
  test.describe.configure({ mode: 'serial' });

  test('Agent sees own follow-ups only (Isolation)', async ({ page, loginAs }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    const tenant = isMK ? 'mk' : 'ks';

    // 1. Login as Agent
    await loginAs('agent');

    // 2. Navigate to Follow-ups using strict navigation helper (handles locale)
    await gotoApp(page, '/agent/follow-ups', testInfo, { marker: 'agent-followups-page-ready' });

    // 3. Verify Isolation based on Tenant
    if (tenant === 'ks') {
      // KS Agent should see their specific items
      await expect(page.getByTestId('followup-row-golden_ks_member_followup_1')).toBeVisible();

      // Should NOT see MK items
      await expect(page.getByTestId('followup-row-golden_mk_member_followup_1')).not.toBeVisible();
    } else {
      // MK Agent should see their specific items
      await expect(page.getByTestId('followup-row-golden_mk_member_followup_1')).toBeVisible();

      // Should NOT see KS items
      await expect(page.getByTestId('followup-row-golden_ks_member_followup_1')).not.toBeVisible();
    }
  });

  test('Agent can mark a follow-up as done (Workflow)', async ({ page, loginAs }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    if (isMK) return; // Only test KS for this workflow to keep it fast

    const targetFollowupId = 'golden_ks_member_followup_workflow';
    // Reset the workflow follow-up so reruns are deterministic.
    await db
      .update(memberFollowups)
      .set({
        status: 'pending',
        dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(memberFollowups.id, targetFollowupId));

    // 1. Login
    await loginAs('agent');

    // 2. Navigate
    await gotoApp(page, '/agent/follow-ups', testInfo, { marker: 'agent-followups-page-ready' });

    // 3. Assert target lead exists
    // Using the specific workflow item seeded for this purpose
    const row = page.getByTestId(`followup-row-${targetFollowupId}`);

    // Explicitly wait for visibility to handle any rendering delays
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText('KS A-Member 1');

    // 4. Click 'Done'
    const doneBtn = page.getByTestId(`followup-done-${targetFollowupId}`);
    await doneBtn.click();

    // 5. Assert row disappears from Pending list
    await expect(row).not.toBeVisible({ timeout: 10000 });

    // 6. Navigate to Done tab and verify item appears
    await page.getByTestId('tab-done').click();
    await expect(page).toHaveURL(/status=done/);

    // 7. Verify row matches in Done list
    await expect(row).toBeVisible();
    await expect(row).toContainText('KS A-Member 1');
  });
});
