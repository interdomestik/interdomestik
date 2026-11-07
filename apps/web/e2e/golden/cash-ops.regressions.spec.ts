import { db, leadPaymentAttempts, memberLeads } from '@interdomestik/database';
import { eq } from 'drizzle-orm';
import en from '../../src/messages/en/agent.json';
import mk from '../../src/messages/mk/agent.json';
import sq from '../../src/messages/sq/agent.json';
import sr from '../../src/messages/sr/agent.json';
import { expect, test } from '../fixtures/auth.fixture';
import { getTenantFromTestInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { messagesFor } from '../utils/locale-messages';
import { gotoApp } from '../utils/navigation';
import {
  insertOwnedMemberLead,
  removeOwnedMemberLead,
  type OwnedLead,
} from '../utils/owned-member-lead';

/**
 * Cash Ops Regressions (Golden Flow): an agent records a consented lead, takes cash, a branch
 * manager approves and the lead converts; plus an admin rejection.
 *
 * The paid flow starts from the agent's real lead entry (consent captured in the dialog) and finds
 * the created lead by its test-owned email. The rejection keeps a fixture lead with a pending cash
 * attempt: it regresses the reject decision only. Each lead is removed after the run with
 * everything derived from it (attempts, converted member), so the seeded branch counts (PC04) and
 * reports never see it and reruns do not accumulate members.
 */
async function attemptStatuses(leadId: string): Promise<string[]> {
  const rows = await db
    .select({ status: leadPaymentAttempts.status })
    .from(leadPaymentAttempts)
    .where(eq(leadPaymentAttempts.leadId, leadId));
  return rows.map(row => row.status);
}

async function leadIdByEmail(email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: memberLeads.id })
    .from(memberLeads)
    .where(eq(memberLeads.email, email));
  return row?.id ?? null;
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
  let paidEmail: string | undefined;

  test.afterAll(async () => {
    // A lead created before its id was read is still found by its test-owned email.
    const id = paid?.id ?? (paidEmail ? await leadIdByEmail(paidEmail) : null);
    await removeOwnedMemberLead(id ? { id, email: paidEmail! } : undefined);
  });

  test('1. Agent: record a consented lead and start a cash payment', async ({
    agentPage: page,
  }, testInfo) => {
    const t = messagesFor({ en, mk, sq, sr }, testInfo).agent.leads_pro;
    const tenant = getTenantFromTestInfo(testInfo) === 'mk' ? 'mk' : 'ks';
    paidEmail = `e2e_cash_ops_paid_${tenant}_${Date.now()}@example.com`;

    await gotoApp(page, routes.agentLeads(testInfo), testInfo, { marker: 'agent-leads-pro' });
    const worklist = page.getByTestId('agent-leads-pro').filter({ visible: true });
    const form = page.getByTestId('create-lead-form');
    // The server-rendered marker can precede hydration; retry until the click opens the form.
    await expect(async () => {
      await worklist.getByTestId('new-lead-button').click();
      await expect(form).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await form.getByTestId('lead-form-firstname').fill('E2E');
    await form.getByTestId('lead-form-lastname').fill('Cash paid');
    await form.getByTestId('lead-form-email').fill(paidEmail);
    await form.getByTestId('lead-form-phone').fill('+38344777555');
    await form.getByTestId('lead-form-consent').click();
    await form.getByTestId('lead-form-submit').click();
    await expect(form).toBeHidden({ timeout: 15_000 });
    await expect.poll(() => leadIdByEmail(paidEmail!), { timeout: 15_000 }).not.toBeNull();
    paid = { id: (await leadIdByEmail(paidEmail))!, email: paidEmail };
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
    // Fixture setup: the reject decision is the regression here, not lead entry.
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
      await removeOwnedMemberLead(rejected);
    }
  });
});
