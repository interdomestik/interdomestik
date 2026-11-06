import { db, leadPaymentAttempts, memberLeads } from '@interdomestik/database';
import { and, eq, inArray } from 'drizzle-orm';
import en from '../../src/messages/en/agent.json';
import mk from '../../src/messages/mk/agent.json';
import sq from '../../src/messages/sq/agent.json';
import sr from '../../src/messages/sr/agent.json';
import { expect, test } from '../fixtures/auth.fixture';
import { getTenantFromTestInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { messagesFor } from '../utils/locale-messages';
import { gotoApp } from '../utils/navigation';
import { insertOwnedMemberLead, type OwnedLead } from '../utils/owned-member-lead';

/**
 * Cash Ops Regressions (Golden Flow): Pay Cash -> branch manager approval -> member conversion,
 * and an admin rejection.
 *
 * The agent workspace has no manual member-lead creation today (CreateLeadDialog is unmounted), so
 * each flow starts from a member lead the test owns, assigned to the signed-in agent's branch. Open
 * attempts and unconverted leads are removed after the run, so the seeded branch counts (PC04)
 * never see them.
 */
async function removeOpenParts(lead: OwnedLead | undefined): Promise<void> {
  if (!lead) return;
  await db
    .delete(leadPaymentAttempts)
    .where(
      and(
        eq(leadPaymentAttempts.leadId, lead.id),
        inArray(leadPaymentAttempts.status, ['pending', 'needs_info'])
      )
    );
  // A converted lead stays with its member; any other owned lead is removed with its attempts.
  const [row] = await db
    .select({ status: memberLeads.status })
    .from(memberLeads)
    .where(eq(memberLeads.id, lead.id));
  if (row && row.status !== 'converted') {
    await db.delete(leadPaymentAttempts).where(eq(leadPaymentAttempts.leadId, lead.id));
    await db.delete(memberLeads).where(eq(memberLeads.id, lead.id));
  }
}

async function attemptStatuses(leadId: string): Promise<string[]> {
  const rows = await db
    .select({ status: leadPaymentAttempts.status })
    .from(leadPaymentAttempts)
    .where(eq(leadPaymentAttempts.leadId, leadId));
  return rows.map(row => row.status);
}

function queueRow(page: import('@playwright/test').Page, email: string) {
  return page
    .getByTestId('cash-verification-row')
    .filter({ visible: true })
    .filter({ has: page.getByText(email, { exact: true }) });
}

test.describe('Golden Flow: Cash Operations', () => {
  test.describe.configure({ mode: 'serial' });

  let paid: OwnedLead | undefined;

  test.afterAll(async () => {
    await removeOpenParts(paid);
  });

  test('1. Agent: start a cash payment on an owned new lead', async ({
    agentPage: page,
  }, testInfo) => {
    const t = messagesFor({ en, mk, sq, sr }, testInfo).agent.leads_pro;
    paid = await insertOwnedMemberLead(
      getTenantFromTestInfo(testInfo) === 'mk' ? 'mk' : 'ks',
      'e2e_cash_ops_paid',
      'Cash paid'
    );

    await gotoApp(page, routes.agentLeads(testInfo), testInfo, { marker: 'agent-leads-pro' });
    const row = page.locator(`[data-testid="lead-row-${paid.id}"]`).filter({ visible: true });
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: t.more_actions }).click();
    await drawer.getByTestId('pay-cash-button').click();
    await expect(page.getByText(t.toasts.payment_requested)).toBeVisible();
    await expect(drawer.getByTestId('ops-status-badge')).toHaveText(t.statuses.payment_pending);
    await expect.poll(() => attemptStatuses(paid!.id)).toEqual(['pending']);
  });

  test('2. Branch Manager: approve the cash payment and convert the lead', async ({
    branchManagerPage: page,
  }, testInfo) => {
    expect(paid, 'lead from step 1').toBeTruthy();
    const params = new URLSearchParams({ query: paid!.email });
    await gotoApp(page, `${routes.adminLeads(testInfo)}?${params}`, testInfo, {
      marker: 'verification-ops-page',
    });
    const row = queueRow(page, paid!.email);
    await expect(row).toHaveCount(1);
    await row.getByTestId('cash-approve').click();
    await expect(row).toHaveCount(0, { timeout: 10000 });

    await expect.poll(() => attemptStatuses(paid!.id)).toEqual(['succeeded']);
    await expect
      .poll(async () => {
        const [lead] = await db
          .select({ status: memberLeads.status, convertedUserId: memberLeads.convertedUserId })
          .from(memberLeads)
          .where(eq(memberLeads.id, paid!.id));
        return lead?.status === 'converted' && lead.convertedUserId !== null;
      })
      .toBe(true);
  });

  test('3. Admin: reject an owned pending cash payment', async ({ adminPage: page }, testInfo) => {
    const tenant = getTenantFromTestInfo(testInfo) === 'mk' ? 'mk' : 'ks';
    const rejected = await insertOwnedMemberLead(tenant, 'e2e_cash_ops_rejected', 'Cash rejected');
    try {
      const [lead] = await db
        .select({ tenantId: memberLeads.tenantId })
        .from(memberLeads)
        .where(eq(memberLeads.id, rejected.id));
      await db.insert(leadPaymentAttempts).values({
        id: `${rejected.id}_attempt`,
        tenantId: lead.tenantId,
        leadId: rejected.id,
        method: 'cash',
        status: 'pending',
        amount: 15000,
      });
      await db
        .update(memberLeads)
        .set({ status: 'payment_pending' })
        .where(eq(memberLeads.id, rejected.id));

      const params = new URLSearchParams({ query: rejected.email });
      await gotoApp(page, `${routes.adminLeads(testInfo)}?${params}`, testInfo, {
        marker: 'verification-ops-page',
      });
      const row = queueRow(page, rejected.email);
      await expect(row).toHaveCount(1);
      await row.getByTestId('cash-reject').click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByTestId('verification-action-note').fill('Rejecting for E2E test.');
      await dialog.getByTestId('verification-action-submit').click();
      await expect(dialog).toBeHidden();
      await expect(row).toHaveCount(0, { timeout: 10000 });
      await expect.poll(() => attemptStatuses(rejected.id)).toEqual(['rejected']);
    } finally {
      await removeOpenParts(rejected);
    }
  });
});
