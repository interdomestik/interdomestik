import { randomUUID } from 'node:crypto';
import { claims, db } from '@interdomestik/database';
import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import type { Locator, Page, TestInfo } from '@playwright/test';
import sq from '../../src/messages/sq/staff-correspondence.json';
import { requireDoorActor } from '../fixtures/one-door-data.fixture';
import { expect } from '../fixtures/one-door.fixture';
import { pdf } from '../fixtures/one-door-upload.fixture';
import { gotoApp } from '../utils/navigation';

export const copy = sq['staff-correspondence'];
export const occurred = '2020-01-02T10:00';

export const instruments = [
  { kind: 'recovery_agreement', file: 'synthetic-recovery.pdf', version: 'Recovery v1' },
  { kind: 'power_of_attorney', file: 'synthetic-attorney.pdf', version: 'Attorney v1' },
  { kind: 'consent_or_lawful_basis', file: 'synthetic-consent.pdf', version: 'Consent v1' },
] as const;
export const sentDocument = 'synthetic-disclosure.pdf';

export async function createCorrespondenceCase() {
  const [staff, member] = await Promise.all([
    requireDoorActor('KS_STAFF'),
    requireDoorActor('KS_MEMBER'),
  ]);
  if (!staff.branchId || !staff.tenantId || staff.tenantId !== member.tenantId) {
    throw new Error('Seeded staff and member must share a tenant, with staff assigned to a branch');
  }
  const claimId = `wp12-${randomUUID()}`;
  // Use a unique claim per attempt. Its append-only register and cited documents live
  // until the gate database is reset, so cleanup cannot bypass their integrity guards.
  await db.insert(claims).values({
    id: claimId,
    title: claimId,
    companyName: 'Synthetic Insurance',
    tenantId: staff.tenantId,
    accessTenantId: staff.tenantId,
    staffId: staff.id,
    userId: member.id,
    branchId: staff.branchId,
    category: 'vehicle',
    ...claimLifecycleFieldsForStatus('verification'),
  });
  return claimId;
}

export async function uploadCasePdf(page: Page, name: string) {
  const upload = page.getByRole('button', { name: copy.documents.upload, exact: true });
  await upload.click();
  const dialog = page.getByRole('dialog', { name: copy.documents.upload });
  await dialog.getByLabel(copy.documents.type).click();
  await page.getByRole('option', { name: copy.documents.legal, exact: true }).click();
  await dialog.getByLabel(copy.documents.file).setInputFiles({
    name,
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await dialog.getByRole('button', { name: copy.documents.upload, exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByTestId('staff-claim-documents')
      .getByTestId('ops-document-row')
      .filter({ hasText: name })
  ).toHaveCount(1);
}

export async function recordBasis(page: Page, instrument: (typeof instruments)[number]) {
  const panel = page.getByRole('region', { name: copy.authorities.title });
  const form = panel.getByRole('form', { name: copy.authorities.record });
  await form.getByLabel(copy.authorities.kind).selectOption(instrument.kind);
  await form.getByLabel(copy.authorities.instrument).selectOption({ label: instrument.file });
  await form.getByLabel(copy.authorities.version).fill(instrument.version);
  await form.getByLabel(copy.authorities.grantedUtc).fill(occurred);
  if (instrument.kind === 'power_of_attorney') {
    await form.getByLabel(copy.authorities.jurisdiction).fill('XK');
    await form.getByRole('checkbox', { name: copy.authorities.attestJurisdiction }).check();
  }
  if (instrument.kind === 'consent_or_lawful_basis') {
    await form.getByLabel(copy.authorities.purpose).fill('Synthetic insurer recovery disclosure');
  }
  await form.getByRole('button', { name: copy.authorities.record }).click();
  await expect(panel.getByRole('listitem').filter({ hasText: instrument.version })).toHaveCount(1);
}

export function registerRow(page: Page, summary: string) {
  return page.getByTestId('staff-correspondence-entry').filter({ hasText: summary });
}

export function recordForm(page: Page) {
  return page.getByRole('form', { name: copy.entry.title });
}

export async function recordOutgoing(page: Page, summary: string, withDocument: boolean) {
  const form = recordForm(page);
  await form.getByLabel(copy.entry.directionLabel).selectOption('outbound');
  await fillContact(form, summary);
  await form
    .getByLabel(copy.authorities.kinds.recovery_agreement)
    .selectOption({ label: instruments[0].version });
  await form
    .getByLabel(copy.authorities.kinds.power_of_attorney)
    .selectOption({ label: instruments[1].version });
  if (withDocument) {
    await form.getByRole('checkbox', { name: sentDocument, exact: true }).check();
    await form
      .getByLabel(copy.authorities.kinds.consent_or_lawful_basis)
      .selectOption({ label: instruments[2].version });
    await form.getByRole('checkbox', { name: copy.entry.attestSharing }).check();
  }
  await form.getByRole('button', { name: copy.entry.record }).click();
  await expect(registerRow(page, summary)).toBeVisible();
}

export async function fillContact(form: Locator, summary: string) {
  await form.getByLabel(copy.entry.occurredUtc).fill(occurred);
  await form.getByLabel(copy.entry.organisation, { exact: true }).fill('Synthetic Insurance');
  await form.getByLabel(copy.entry.body).fill(summary);
}

export async function saveFollowUp(row: Locator, date: string) {
  await row.getByLabel(copy.list.followUpUtc).fill(date);
  await row.getByRole('button', { name: copy.list.saveFollowUp }).click();
  await expect(row.getByRole('status')).toHaveText(copy.feedback.saved);
}

/**
 * Asserts one copy without waiting a duplicate out, and names where each copy sits.
 * A hidden copy counts: the gate treats any duplicate render as a defect.
 */
export async function expectSingle(locator: Locator, label: string) {
  await expect(locator.first()).toBeAttached();
  const copies = await locator.evaluateAll(nodes =>
    nodes.map(node => ({
      inRoleShell: node.closest('[data-testid="role-shell"]') !== null,
      visible: node.getClientRects().length > 0,
      container:
        node.parentElement?.closest('[data-testid]')?.getAttribute('data-testid') ?? 'document',
    }))
  );
  expect(copies, `${label} must render once; copies: ${JSON.stringify(copies)}`).toHaveLength(1);
}

export async function expectRegisterSectionsOnce(page: Page) {
  await expectSingle(page.getByTestId('staff-correspondence-list'), 'Correspondence list');
  // The heading's own text names it, so a copy with a stale aria-labelledby still counts.
  const caseFieldsHeading = page.getByRole('heading', {
    level: 2,
    name: copy.caseFields.title,
    exact: true,
    includeHidden: true,
  });
  await expectSingle(caseFieldsHeading, 'Case fields section');
}

// Counts every queue row carrying the claim's title, with or without its view link.
export const queueRows = (page: Page, claimId: string) =>
  page.getByTestId('staff-claims-row').filter({ hasText: claimId });

export async function openQueue(
  page: Page,
  claimId: string,
  origin: string,
  locale: string,
  info: TestInfo
) {
  await gotoApp(page, `/${locale}/staff/claims?search=${encodeURIComponent(claimId)}`, info, {
    baseURL: origin,
    marker: 'staff-page-ready',
  });
  await expectSingle(queueRows(page, claimId), `Queue row for ${claimId}`);
  const row = page.getByTestId('staff-claims-row').filter({
    has: page
      .getByTestId('staff-claims-view')
      .and(page.locator(`a[href$="/staff/claims/${claimId}"]`)),
  });
  const shellRow = page.getByTestId('role-shell').getByTestId('staff-claims-row').and(row);
  await expect(shellRow).toBeVisible();
  return shellRow.getByTestId('staff-claim-overdue-follow-up');
}
