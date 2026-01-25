import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Follow-ups (Gate)', () => {
  test('Agent sees own follow-ups only (Isolation)', async ({ page, loginAs }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    const tenant = isMK ? 'mk' : 'ks';

    // 1. Login as Agent
    await loginAs('agent');

    // 2. Navigate to Follow-ups using strict navigation helper (handles locale)
    await gotoApp(page, '/agent/follow-ups', testInfo, { marker: 'agent-followups-page-ready' });

    // 3. Verify Isolation based on Tenant
    if (tenant === 'ks') {
      // KS Agent should see 2 items
      await expect(page.getByTestId(/^followup-row-/)).toHaveCount(2);
      await expect(page.getByTestId('followup-row-golden_ks_followup_lead_1')).toBeVisible();
      await expect(page.getByTestId('followup-row-golden_ks_followup_lead_2')).toBeVisible();

      // Should NOT see MK items
      await expect(page.getByTestId('followup-row-golden_mk_followup_lead_1')).not.toBeVisible();
    } else {
      // MK Agent should see 1 item
      await expect(page.getByTestId(/^followup-row-/)).toHaveCount(1);
      await expect(page.getByTestId('followup-row-golden_mk_followup_lead_1')).toBeVisible();

      // Should NOT see KS items
      await expect(page.getByTestId('followup-row-golden_ks_followup_lead_1')).not.toBeVisible();
    }
  });
});
