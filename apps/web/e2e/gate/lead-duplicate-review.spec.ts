import { and, auditLog, db, eq, inArray, memberLeads, or } from '@interdomestik/database';

import { expect, test } from '../fixtures/auth.fixture';
import { getTenantFromTestInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { insertOwnedMemberLead, removeOwnedMemberLead } from '../utils/owned-member-lead';

const REFERRAL_ACTION = 'AGENT_LEAD_POSSIBLE_DUPLICATE';
const RESOLVED_ACTION = 'AGENT_LEAD_DUPLICATE_RESOLVED';

async function referralFor(leadId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(and(eq(auditLog.action, REFERRAL_ACTION), eq(auditLog.entityId, leadId)))
    .limit(1);
  return row?.id ?? null;
}

test.describe('Lead duplicate review (IDA-CRM-003)', () => {
  test('a refused agent duplicate reaches review, resolves once and stays resolved after reload', async ({
    agentPage,
    adminPage,
  }, testInfo) => {
    const tenant = getTenantFromTestInfo(testInfo) === 'mk' ? 'mk' : 'ks';
    // The existing lead is the agent's own but closed, so a new submission with its email is not
    // the agent's open lead: the app refuses it as a possible duplicate and refers it for review.
    const existing = await insertOwnedMemberLead(tenant, 'e2e_dup_review', 'Existing');
    let referralId: string | null = null;

    try {
      await db.update(memberLeads).set({ status: 'lost' }).where(eq(memberLeads.id, existing.id));

      await gotoApp(agentPage, routes.agentLeads(testInfo), testInfo, {
        marker: 'agent-leads-pro',
      });
      const worklist = agentPage.getByTestId('agent-leads-pro').filter({ visible: true });
      await worklist.getByTestId('new-lead-button').click();
      const form = agentPage.getByTestId('create-lead-form');
      await form.getByTestId('lead-form-firstname').fill('E2E');
      await form.getByTestId('lead-form-lastname').fill('Duplicate');
      await form.getByTestId('lead-form-email').fill(existing.email.toUpperCase());
      await form.getByTestId('lead-form-phone').fill('+38344777666');
      await form.getByTestId('lead-form-consent').click();
      await form.getByTestId('lead-form-submit').click();

      await expect.poll(() => referralFor(existing.id), { timeout: 15_000 }).not.toBeNull();
      referralId = await referralFor(existing.id);

      const reviewUrl = `${routes.adminLeads(testInfo)}?view=duplicates`;
      // The router keeps a hidden copy of a revisited page, so rows are read where visible.
      const row = () =>
        adminPage.getByTestId(`lead-duplicate-${referralId}`).filter({ visible: true });
      await gotoApp(adminPage, reviewUrl, testInfo, { marker: 'lead-duplicates-page' });
      await expect(row()).toBeVisible();
      await row().getByTestId(`duplicate-keep-${referralId}`).click();
      // The refreshed pending queue no longer holds the resolved referral, also after a reload.
      await expect(row()).toHaveCount(0);
      await adminPage.reload();
      await expect(
        adminPage.getByTestId('lead-duplicates-page').filter({ visible: true })
      ).toBeVisible();
      await expect(row()).toHaveCount(0);

      await gotoApp(adminPage, `${reviewUrl}&state=resolved`, testInfo, {
        marker: 'lead-duplicates-page',
      });
      await expect(row()).toBeVisible();

      const resolutions = await db
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(and(eq(auditLog.action, RESOLVED_ACTION), eq(auditLog.entityId, referralId!)));
      expect(resolutions).toHaveLength(1);
    } finally {
      if (referralId) {
        await db
          .delete(auditLog)
          .where(
            or(
              eq(auditLog.id, referralId),
              and(eq(auditLog.action, RESOLVED_ACTION), inArray(auditLog.entityId, [referralId]))
            )
          );
      }
      await removeOwnedMemberLead(existing);
    }
  });
});
