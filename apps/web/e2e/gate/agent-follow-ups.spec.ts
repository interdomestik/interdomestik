import { db, eq, memberFollowups } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

const KS_LITE_FOLLOWUP_ID = 'golden_ks_member_followup_lite_1';
const MK_FOLLOWUP_ID = 'golden_mk_member_followup_1';

async function ensureFollowupExists(opts: {
  id: string;
  tenantId: 'tenant_ks' | 'tenant_mk';
  agentId: string;
  memberId: string;
  note: string;
}) {
  const dueAt = new Date();
  await db
    .insert(memberFollowups)
    .values({
      id: opts.id,
      tenantId: opts.tenantId,
      agentId: opts.agentId,
      memberId: opts.memberId,
      status: 'pending',
      note: opts.note,
      dueAt,
    })
    .onConflictDoUpdate({
      target: memberFollowups.id,
      set: { status: 'pending', dueAt, note: opts.note },
    });
}

test.describe('Agent Follow-ups (Gate)', () => {
  // Serial mode to ensure no interference between tests
  test.describe.configure({ mode: 'serial' });

  test('Agent sees own follow-ups only (Isolation)', async ({ page, loginAs }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    const tenant = isMK ? 'mk' : 'ks';

    if (tenant === 'ks') {
      await ensureFollowupExists({
        id: KS_LITE_FOLLOWUP_ID,
        tenantId: 'tenant_ks',
        agentId: 'golden_ks_agent_lite_1',
        memberId: 'golden_ks_a_member_3',
        note: 'Lite agent follow-up (E2E)',
      });
    } else {
      await ensureFollowupExists({
        id: MK_FOLLOWUP_ID,
        tenantId: 'tenant_mk',
        agentId: 'golden_mk_agent_a1',
        memberId: 'golden_mk_member_1',
        note: 'Welcome call for new member',
      });
    }

    // 1. Login as Agent
    await loginAs('agent_lite');

    // 2. Navigate to Follow-ups using strict navigation helper (handles locale)
    await gotoApp(page, '/agent/follow-ups', testInfo, { marker: 'agent-followups-page-ready' });

    // 3. Verify Isolation based on Tenant
    if (tenant === 'ks') {
      // KS Agent should see their specific items
      await expect(page.getByTestId(`followup-row-${KS_LITE_FOLLOWUP_ID}`)).toBeVisible();

      // Should NOT see MK items
      await expect(page.getByTestId(`followup-row-${MK_FOLLOWUP_ID}`)).not.toBeVisible();
    } else {
      // MK Agent should see their specific items
      await expect(page.getByTestId(`followup-row-${MK_FOLLOWUP_ID}`)).toBeVisible();

      // Should NOT see KS items
      await expect(page.getByTestId(`followup-row-${KS_LITE_FOLLOWUP_ID}`)).not.toBeVisible();
    }
  });

  test('Agent can mark a follow-up as done (Workflow)', async ({ page, loginAs }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    if (isMK) return; // Only test KS for this workflow to keep it fast

    const targetFollowupId = KS_LITE_FOLLOWUP_ID;
    await ensureFollowupExists({
      id: KS_LITE_FOLLOWUP_ID,
      tenantId: 'tenant_ks',
      agentId: 'golden_ks_agent_lite_1',
      memberId: 'golden_ks_a_member_3',
      note: 'Lite agent follow-up (E2E)',
    });
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
    await loginAs('agent_lite');

    // 2. Navigate
    await gotoApp(page, '/agent/follow-ups', testInfo, { marker: 'agent-followups-page-ready' });

    // 3. Assert target lead exists
    // Using the specific workflow item seeded for this purpose
    const row = page.getByTestId(`followup-row-${targetFollowupId}`);

    // Explicitly wait for visibility to handle any rendering delays
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText('KS A-Member 3');

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
    await expect(row).toContainText('KS A-Member 3');
  });
});
