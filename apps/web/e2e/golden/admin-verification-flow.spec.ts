import { db, leadPaymentAttempts, notifications } from '@interdomestik/database';
import { memberLeads } from '@interdomestik/database/schema/leads';
import { and, eq, gte } from 'drizzle-orm';
import { OPS_TEST_IDS } from '../../src/components/ops/testids';
import en from '../../src/messages/en/admin-leads.json';
import mk from '../../src/messages/mk/admin-leads.json';
import sq from '../../src/messages/sq/admin-leads.json';
import sr from '../../src/messages/sr/admin-leads.json';
import { expect, test } from '../fixtures/auth.fixture';
import { getTenantFromTestInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { TENANT_OPEN_CASH_LEAD_EMAIL } from '../utils/cash-states';
import { gotoApp } from '../utils/navigation';

const TENANT_IDS = { ks: 'tenant_ks', mk: 'tenant_mk' } as const;
const LABELS = {
  de: sq.admin.leads,
  en: en.admin.leads,
  hr: sq.admin.leads,
  mk: mk.admin.leads,
  sq: sq.admin.leads,
  sr: sr.admin.leads,
};

// The flow acts on one named seeded request of the admin's own tenant, never on whichever row
// happens to come first, and restores that attempt to its seeded state afterwards. Every state it
// passes through (needs_info, resubmitted) stays in the open queue, so tests that read the queue
// see the same request in any order.
test.describe('Admin Verification Flow (Golden)', () => {
  test('Tenant Admin can request info via Drawer, search, and toggle views', async ({
    adminPage: page,
  }, testInfo) => {
    const tenant = getTenantFromTestInfo(testInfo) === 'mk' ? 'mk' : 'ks';
    const email = TENANT_OPEN_CASH_LEAD_EMAIL[tenant];
    const L = LABELS[routes.getLocale(testInfo)];
    const [target] = await db
      .select({ id: leadPaymentAttempts.id, agentId: memberLeads.agentId })
      .from(leadPaymentAttempts)
      .innerJoin(memberLeads, eq(memberLeads.id, leadPaymentAttempts.leadId))
      .where(and(eq(memberLeads.email, email), eq(memberLeads.tenantId, TENANT_IDS[tenant])));
    expect(target, `seeded open cash request ${email}`).toBeTruthy();
    const startedAt = new Date();

    try {
      // 1. Open the queue on the named request.
      const params = new URLSearchParams({ query: email });
      await gotoApp(page, `${routes.adminLeads(testInfo)}?${params}`, testInfo, {
        marker: 'verification-ops-page',
      });
      const row = page
        .getByTestId('cash-verification-row')
        .filter({ visible: true })
        .filter({ has: page.getByText(email, { exact: true }) });
      await expect(row).toHaveCount(1);

      const status = row.getByTestId('verification-status');
      await expect(status).toHaveAttribute('data-status', 'pending');

      // 2. Seeded cash requests carry no receipt, so the row flags the missing proof.
      await expect(row.getByText(L.labels.missing_proof, { exact: true })).toBeVisible();

      // 3. Request info through the drawer.
      await row.getByRole('button', { name: L.actions.details }).click();
      const drawer = page.getByTestId(OPS_TEST_IDS.DRAWER);
      await expect(drawer).toBeVisible();
      await expect(drawer.getByText(L.drawer.documents, { exact: true })).toBeVisible();
      await expect(drawer.getByText(L.drawer.timeline, { exact: true })).toBeVisible();
      await drawer.getByRole('button', { name: L.actions.needs_info }).click();
      await drawer.getByRole('textbox').fill('Receipt missing date via Drawer.');
      await drawer.getByRole('button', { name: L.actions.submit, exact: true }).click();
      await expect(page.getByText(L.toasts.needs_info_success)).toBeVisible();
      await expect(drawer).not.toBeVisible();
      await expect(status).toHaveAttribute('data-status', 'needs_info');
      await expect(status).toHaveText(L.status.needs_info);
      await expect
        .poll(async () => {
          const [attempt] = await db
            .select({ status: leadPaymentAttempts.status })
            .from(leadPaymentAttempts)
            .where(eq(leadPaymentAttempts.id, target.id));
          return attempt?.status;
        })
        .toBe('needs_info');

      // 4. The agent resubmits (written directly for speed) and the row shows it.
      await db
        .update(leadPaymentAttempts)
        .set({ status: 'pending', isResubmission: true, updatedAt: new Date() })
        .where(eq(leadPaymentAttempts.id, target.id));
      await page.reload();
      await expect(status).toHaveAttribute('data-status', 'resubmitted');
      await expect(status).toHaveText(L.status.resubmitted);

      // 5. Search narrows to nothing and back.
      const searchInput = page.getByPlaceholder(L.search_placeholder).filter({ visible: true });
      const pending = page.getByTestId('verification-search-pending');
      const empty = page.getByTestId(OPS_TEST_IDS.TABLE.EMPTY).filter({ visible: true });
      await searchInput.fill('NonExistentName123');
      await expect(pending).toHaveCount(0);
      await expect(empty).toContainText(L.empty_state);
      await searchInput.fill(email);
      await expect(pending).toHaveCount(0);
      await expect(row).toHaveCount(1);

      // 6. History view.
      await page.getByRole('button', { name: L.tabs.history, exact: true }).click();
      await expect(page).toHaveURL(/view=history/);
      for (const header of [L.table.status, L.table.verifier]) {
        await expect(
          page.getByRole('columnheader', { name: header, exact: true }).filter({ visible: true })
        ).toBeVisible();
      }

      // 7. The lead's agent was notified of this request, after this test started.
      await expect
        .poll(async () => {
          const rows = await db
            .select({ title: notifications.title })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, target.agentId),
                eq(notifications.type, 'payment_verification_update'),
                gte(notifications.createdAt, startedAt)
              )
            );
          return rows.map(notification => notification.title);
        })
        .toContain('Payment Needs Info');
    } finally {
      await db
        .update(leadPaymentAttempts)
        .set({
          status: 'pending',
          isResubmission: false,
          verifiedBy: null,
          verifiedAt: null,
          verificationNote: null,
          updatedAt: new Date(),
        })
        .where(eq(leadPaymentAttempts.id, target.id));
    }
  });
});
