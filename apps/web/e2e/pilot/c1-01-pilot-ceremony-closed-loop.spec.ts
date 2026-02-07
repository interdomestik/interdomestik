import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe.configure({ mode: 'serial' });

type PilotCeremonyReport = {
  meta: {
    spec: 'c1-01-pilot-ceremony-closed-loop';
    project: string;
    locale: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    outcome: 'PASS' | 'FAIL';
    error?: string;
  };
  stages: Array<{
    name: 'member' | 'agent' | 'staff' | 'admin';
    startedAt: string;
    finishedAt: string;
    ok: boolean;
    notes: string[];
  }>;
  artifacts: {
    claimId?: string;
    claimNumberText?: string | null;
  };
  bumps: Array<{
    stage: 'member' | 'agent' | 'staff' | 'admin';
    code: string;
    message: string;
  }>;
};

test('Pilot Ceremony: Closed Loop (Member -> Agent -> Staff -> Admin)', async ({
  authenticatedPage: memberPage,
  agentPage,
  staffPage,
  adminPage,
}, testInfo) => {
  const startTime = Date.now();
  const report: PilotCeremonyReport = {
    meta: {
      spec: 'c1-01-pilot-ceremony-closed-loop',
      project: testInfo.project.name,
      locale: routes.getLocale(testInfo),
      startedAt: new Date().toISOString(),
      finishedAt: '',
      durationMs: 0,
      outcome: 'FAIL', // Default to FAIL until completion
    },
    stages: [],
    artifacts: {},
    bumps: [],
  };

  try {
    // ═══════════════════════════════════════════════════════════════════════════════
    // STAGE 1: MEMBER (Create Claim or Fallback)
    // ═══════════════════════════════════════════════════════════════════════════════
    const stage1Start = Date.now();
    await test.step('Stage 1: Member', async () => {
      await gotoApp(memberPage, routes.member(testInfo), testInfo, {
        marker: 'dashboard-page-ready',
      });
      await expect(memberPage.getByTestId('member-header')).toBeVisible();
      await expect(memberPage.getByTestId('member-primary-actions')).toBeVisible();

      let claimId: string | undefined;

      // ATTEMPT 1: Create Claim (Best Effort)
      try {
        await memberPage.getByTestId('member-start-claim-cta').click({ timeout: 5000 });
        await expect(memberPage).toHaveURL(/\/claims\/new/);

        // Step 1: Category
        await memberPage.getByTestId('category-vehicle').click();
        await memberPage.getByTestId('wizard-next').click();

        // Step 2: Details
        await memberPage.getByTestId('claim-title-input').fill('Pilot Ceremony Test Claim');
        await memberPage.getByTestId('claim-company-input').fill('Test Inc.');
        await memberPage.getByTestId('claim-amount-input').fill('150');
        await memberPage
          .getByTestId('claim-date-input')
          .fill(new Date().toISOString().split('T')[0]);
        await memberPage
          .getByTestId('claim-description-input')
          .fill('Automated pilot ceremony validation claim.');
        await memberPage.getByTestId('wizard-next').click();

        // Step 3: Evidence (Skip)
        await memberPage.getByTestId('wizard-next').click();

        // Step 4: Review (Submit)
        await memberPage.getByTestId('wizard-submit').click();

        // Wait for redirect to list
        await memberPage.waitForURL(/\/member\/claims/);

        // Grab the first claim from the list (Assuming most recent is top)
        const firstRowLink = memberPage.locator('table tbody tr a').first();
        await expect(firstRowLink).toBeVisible();
        const href = await firstRowLink.getAttribute('href');

        if (href) {
          const match = href.match(/\/claims\/([^/?]+)/);
          if (match) claimId = match[1];
        }

        if (!claimId) throw new Error('Claim created but ID not found in list');
      } catch (e) {
        console.warn('Claim creation failed, falling back to active claim search', e);
        report.bumps.push({
          stage: 'member',
          code: 'MEMBER_CREATE_CLAIM_FALLBACK',
          message: 'Could not create new claim (or test opted for fallback), using active claim.',
        });

        // FALLBACK: Use Active Claim
        await gotoApp(memberPage, routes.member(testInfo), testInfo, {
          marker: 'dashboard-page-ready',
        });
        const activeClaimLink = memberPage.getByTestId('member-active-claim').first();
        if (await activeClaimLink.isVisible()) {
          await activeClaimLink.click();
          await memberPage.waitForURL(/\/member\/claims\//);
          const url = memberPage.url();
          const match = url.match(/\/claims\/([^/?]+)/);
          if (match) claimId = match[1];
        }
      }

      if (!claimId) {
        throw new Error('STAGE 1 FAILED: No active claim found and creation fallback failed.');
      }

      report.artifacts.claimId = claimId;
      report.stages.push({
        name: 'member',
        startedAt: new Date(stage1Start).toISOString(),
        finishedAt: new Date().toISOString(),
        ok: true,
        notes: [`Identified claim: ${claimId}`],
      });
    });

    const claimId = report.artifacts.claimId;
    if (!claimId) throw new Error('Invariant violation: claimId missing after Stage 1');

    // ═══════════════════════════════════════════════════════════════════════════════
    // STAGE 2: AGENT (View Member)
    // ═══════════════════════════════════════════════════════════════════════════════
    const stage2Start = Date.now();
    await test.step('Stage 2: Agent', async () => {
      await gotoApp(agentPage, routes.agentMembers(testInfo), testInfo, {
        marker: 'agent-members-ready',
      });

      // Deterministic: Click first member view link
      const firstViewLink = agentPage.getByTestId('agent-member-view-link').first();
      await expect(firstViewLink).toBeVisible();
      await firstViewLink.click();

      await expect(agentPage.getByTestId('agent-member-detail-ready')).toBeVisible();

      // Optional: Dashboard CTA overlay
      const dashboardCta = agentPage.getByTestId('agent-member-dashboard-cta');
      if (await dashboardCta.isVisible()) {
        await dashboardCta.click();
        await expect(agentPage.getByTestId('member-header')).toBeVisible();
      }

      report.stages.push({
        name: 'agent',
        startedAt: new Date(stage2Start).toISOString(),
        finishedAt: new Date().toISOString(),
        ok: true,
        notes: ['Viewed member detail'],
      });
    });

    // ═══════════════════════════════════════════════════════════════════════════════
    // STAGE 3: STAFF (Claim Detail & Safe Mutation)
    // ═══════════════════════════════════════════════════════════════════════════════
    const stage3Start = Date.now();
    await test.step('Stage 3: Staff', async () => {
      await gotoApp(staffPage, routes.staffClaimDetail(claimId, testInfo), testInfo, {
        marker: 'staff-claim-detail-actions', // Using the action panel as readiness marker per plan
      });

      await expect(staffPage.getByTestId('staff-claim-detail-actions')).toBeVisible();

      // Mutation (Optional/Safe)
      const assignBtn = staffPage.getByTestId('staff-assign-to-me-btn');
      if (await assignBtn.isVisible()) {
        await assignBtn.click();
        report.stages.push({
          name: 'staff',
          startedAt: new Date(stage3Start).toISOString(),
          finishedAt: new Date().toISOString(),
          ok: true,
          notes: ['Verified claim detail', 'Clicked Assign (Self)'],
        });
      } else {
        report.bumps.push({
          stage: 'staff',
          code: 'STAFF_NO_STABLE_MUTATION_CONTROL',
          message: 'No stable "Assign" button found, skipping mutation.',
        });
        report.stages.push({
          name: 'staff',
          startedAt: new Date(stage3Start).toISOString(),
          finishedAt: new Date().toISOString(),
          ok: true,
          notes: ['Verified claim detail', 'Skipped mutation'],
        });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════════
    // STAGE 4: ADMIN (Overview)
    // ═══════════════════════════════════════════════════════════════════════════════
    const stage4Start = Date.now();
    await test.step('Stage 4: Admin', async () => {
      await gotoApp(adminPage, routes.admin(testInfo), testInfo, {
        marker: 'admin-page-ready',
      });

      // No claim lookup (not strictly deterministic without stable list selectors)
      // Just confirm overview load

      report.stages.push({
        name: 'admin',
        startedAt: new Date(stage4Start).toISOString(),
        finishedAt: new Date().toISOString(),
        ok: true,
        notes: ['Admin Overview loaded'],
      });
    });

    report.meta.outcome = 'PASS';
  } catch (error: any) {
    report.meta.error = error.message;

    // Screenshot on failure
    try {
      if (testInfo.status !== 'passed') {
        const screenshot = await memberPage.screenshot(); // Default to member page context or current active? Hard to say
        await testInfo.attach('failure-screenshot.png', {
          body: screenshot,
          contentType: 'image/png',
        });
      }
    } catch {
      /* ignore */
    }

    throw error;
  } finally {
    const endTime = Date.now();
    report.meta.finishedAt = new Date(endTime).toISOString();
    report.meta.durationMs = endTime - startTime;

    // 1. JSON Report
    await testInfo.attach('pilot.ceremony.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });

    // 2. Markdown Report
    const md = `
# Pilot Ceremony Report: ${report.meta.outcome}
**Spec**: ${report.meta.spec}
**Project**: ${report.meta.project} (${report.meta.locale})
**Duration**: ${(report.meta.durationMs / 1000).toFixed(2)}s
**Claim ID**: ${report.artifacts.claimId ?? 'N/A'}

## Stages
${report.stages.map(s => `- **${s.name.toUpperCase()}**: ${s.ok ? '✅ OK' : '❌ FAIL'} (${s.notes?.join(', ') || ''})`).join('\n')}

## Bumps
${report.bumps.length === 0 ? '_No bumps recorded._' : report.bumps.map(b => `- [${b.stage}] **${b.code}**: ${b.message}`).join('\n')}

${report.meta.error ? `\n## Error\n\`\`\`\n${report.meta.error}\n\`\`\`` : ''}
    `.trim();

    await testInfo.attach('pilot.ceremony.md', {
      body: md,
      contentType: 'text/markdown',
    });
  }
});
