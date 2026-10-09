import type { Page } from '@playwright/test';
import {
  and,
  claims,
  db,
  domainEventDeliveries,
  domainEvents,
  eq,
  inArray,
} from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { withAdminAssignmentFixture } from './admin-assignment.fixture';
import en from '../../src/messages/en/admin-claims.json';
import sq from '../../src/messages/sq/admin-claims.json';
import mk from '../../src/messages/mk/admin-claims.json';
import sr from '../../src/messages/sr/admin-claims.json';
import enClaims from '../../src/messages/en/claims.json';
import sqClaims from '../../src/messages/sq/claims.json';
import mkClaims from '../../src/messages/mk/claims.json';
import srClaims from '../../src/messages/sr/claims.json';

const catalogs = { en, sq, mk, sr };
const claimCatalogs = { en: enClaims, sq: sqClaims, mk: mkClaims, sr: srClaims };

async function expectOpsReady(page: Page, title: string) {
  const shell = page.getByTestId('dashboard-page-ready').filter({ visible: true });
  await expect(shell).toHaveCount(1);
  const heading = shell.getByRole('heading', { level: 1, name: title, exact: true });
  await expect(heading).toHaveCount(1);
  await expect(heading).toBeVisible();
  const panel = shell.getByTestId('ops-next-actions');
  await expect(panel).toHaveCount(1);
  await expect(panel).toBeVisible();
  // Streaming may retain an outside-shell node; two live cards must still fail.
  await expect(page.getByTestId('ops-next-actions').filter({ visible: true })).toHaveCount(1);
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  return panel;
}

test('admin Ops commits status and internal notes, preserves cooldown, and keeps branch manager read-only', async ({
  adminPage: page,
  branchManagerPage: branchPage,
}, info) => {
  // Owned synthetic mutations belong to the required tenant Gate projects, not other lanes.
  test.skip(!info.project.name.startsWith('gate-'), 'Selected by both tenant Gate projects');
  test.setTimeout(120_000);
  const locale = routes.getLocale(info);
  if (!(locale in catalogs)) throw new Error('Expected an approved Ops locale');
  const key = locale as keyof typeof catalogs;
  const copy = catalogs[key].admin.claims_page.next_actions;
  const branchSession = await branchPage
    .context()
    .request.get(new URL('/api/auth/get-session', branchPage.url()).toString());
  expect(branchSession.status()).toBe(200);
  const actor = (await branchSession.json()).user;
  expect(actor.role).toBe('branch_manager');
  expect(typeof actor.branchId).toBe('string');
  expect(actor.branchId.length).toBeGreaterThan(0);

  await withAdminAssignmentFixture(info, async fixture => {
    // Only this owned case changes branch; the verified manager must be able to read it.
    const scope = eq(claims.id, fixture.claimId);
    await db.update(claims).set({ branchId: actor.branchId }).where(scope);
    const row = await db.query.claims.findFirst({ where: scope });
    if (!row) throw new Error('Expected owned Ops fixture');
    const eventScope = and(
      eq(domainEvents.entityId, fixture.claimId),
      eq(domainEvents.tenantId, row.tenantId)
    );
    try {
      const response = await gotoApp(page, `/admin/claims/${fixture.claimId}`, info, {
        marker: 'admin-page-ready',
      });
      expect(response?.status()).toBe(200);
      const panel = await expectOpsReady(page, fixture.title);
      const status = panel.getByRole('combobox', {
        name: copy.actions.update_status.label,
        exact: true,
      });
      await status.focus();
      await status.press('ArrowDown');
      await expect(page.getByRole('listbox')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(status).toBeFocused();
      const cancelled = await fixture.readState();
      expect(cancelled.lifecycleUnchanged).toBe(true);
      expect(cancelled.audits).toHaveLength(0);
      expect(cancelled.historyCount).toBe(0);
      expect(cancelled.messageCount).toBe(0);
      expect(await db.query.domainEvents.findMany({ where: eventScope })).toHaveLength(0);
      await status.click();
      const verification = page.getByRole('option', {
        name: claimCatalogs[key].claims.status.verification,
        exact: true,
      });
      await Promise.all([page.waitForEvent('load'), verification.click()]);
      await expectOpsReady(page, fixture.title);
      expect((await db.query.claims.findFirst({ where: scope }))?.caseLifecycleState).toBe(
        'verification'
      );
      const transitioned = await fixture.readState();
      expect(transitioned.audits.map(audit => audit.action)).toEqual(['update_status']);
      expect(transitioned.historyCount).toBe(1);
      expect(transitioned.messageCount).toBe(0);
      const statusEvents = await db.query.domainEvents.findMany({ where: eventScope });
      expect(statusEvents).toHaveLength(2);

      await expect(
        panel.getByText(copy.actions.message_poke.description, { exact: true })
      ).toBeVisible();
      const reminder = panel.getByRole('button', {
        name: copy.actions.message_poke.label,
        exact: true,
      });
      await Promise.all([page.waitForEvent('load'), reminder.click()]);
      await expectOpsReady(page, fixture.title);
      const recorded = await fixture.readState();
      expect(recorded.messageCount).toBe(1);
      expect(recorded.audits.map(audit => audit.action).sort()).toEqual([
        'send_reminder',
        'update_status',
      ]);
      expect(recorded.historyCount).toBe(1);
      const actionResponse = page.waitForResponse(
        response =>
          response.request().method() === 'POST' &&
          Boolean(response.request().headers()['next-action'])
      );
      await reminder.click();
      expect((await actionResponse).ok()).toBe(true);
      await expectOpsReady(page, fixture.title);
      await expect(page.getByText(/^Rate limited\. Last reminder recorded/)).toBeVisible();
      expect((await fixture.readState()).messageCount).toBe(1);
      expect((await fixture.readState()).audits).toHaveLength(2);

      // Age this same owned verification stage; no lifecycle transition or history is fabricated.
      await db
        .update(claims)
        .set({
          statusUpdatedAt: new Date(Date.now() - 20 * 86_400_000),
        })
        .where(scope);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expectOpsReady(page, fixture.title);
      const acknowledge = panel.getByRole('button', {
        name: copy.actions.ack_sla.label,
        exact: true,
      });
      await expect(acknowledge).toHaveCount(1);
      await Promise.all([page.waitForEvent('load'), acknowledge.click()]);
      await expectOpsReady(page, fixture.title);
      const acknowledged = await fixture.readState();
      expect(acknowledged.messageCount).toBe(2);
      expect(acknowledged.audits.map(audit => audit.action).sort()).toEqual([
        'acknowledge_sla',
        'send_reminder',
        'update_status',
      ]);
      expect(acknowledged.historyCount).toBe(1);
      expect(await db.query.domainEvents.findMany({ where: eventScope })).toHaveLength(2);

      const branchResponse = await gotoApp(branchPage, `/admin/claims/${fixture.claimId}`, info, {
        marker: 'admin-page-ready',
      });
      expect(branchResponse?.status()).toBe(200);
      const readOnlyPanel = await expectOpsReady(branchPage, fixture.title);
      await expect(readOnlyPanel.getByRole('combobox')).toHaveCount(0);
      await expect(readOnlyPanel.getByRole('button')).toHaveCount(0);
      await expect(branchPage.getByRole('dialog')).toHaveCount(0);
      await branchPage.reload({ waitUntil: 'domcontentloaded' });
      await expectOpsReady(branchPage, fixture.title);
      await expect(readOnlyPanel.getByRole('combobox')).toHaveCount(0);
      await expect(readOnlyPanel.getByRole('button')).toHaveCount(0);
      expect((await fixture.readState()).audits).toHaveLength(3);
      expect((await fixture.readState()).messageCount).toBe(2);
    } finally {
      // The shared assignment fixture cleans notes/audits/history/claim; status adds these events.
      const events = await db.query.domainEvents.findMany({
        where: eventScope,
        columns: { id: true },
      });
      if (events.length) {
        const ids = events.map(event => event.id);
        await db.delete(domainEventDeliveries).where(inArray(domainEventDeliveries.eventId, ids));
        await db.delete(domainEvents).where(inArray(domainEvents.id, ids));
      }
    }
  });
});
