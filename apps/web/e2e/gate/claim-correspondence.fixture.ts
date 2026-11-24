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

type CopyQuery = { kind: 'list' | 'caseFields' | 'queueRow'; text: string };

// Runs in the browser: finds and describes every copy in one synchronous DOM pass.
function describeCopies({ kind, text }: CopyQuery) {
  const exact = (element: Element | null) => element?.textContent?.trim() === text;
  const selector = {
    list: '[data-testid="staff-correspondence-list"]',
    caseFields: 'section',
    queueRow: '[data-testid="staff-claims-row"]',
  }[kind];
  const matches = Array.from(document.querySelectorAll(selector)).filter(node => {
    if (kind === 'caseFields') return Array.from(node.querySelectorAll(':scope > h2')).some(exact);
    if (kind === 'queueRow') {
      return (
        exact(node.querySelector('[data-testid="staff-claim-title"]')) ||
        node.querySelector(`a[href$="/staff/claims/${text}"]`) !== null
      );
    }
    return true;
  });
  return matches.map((node, index) => {
    const ancestors: string[] = [];
    for (let at = node.parentElement; at && at !== document.body; at = at.parentElement) {
      const testId = at.getAttribute('data-testid');
      if (testId) ancestors.push(testId);
    }
    return {
      index,
      inRoleShell: node.closest('[data-testid="role-shell"]') !== null,
      visible: node.checkVisibility({ visibilityProperty: true, opacityProperty: true }),
      id: node.id || null,
      labelledBy: node.getAttribute('aria-labelledby'),
      ancestors,
    };
  });
}

/**
 * Waits for the first copy, then judges that same DOM sample: a duplicate cannot be
 * waited out, and the message names where each copy sits, hidden copies included.
 */
export async function expectSingle(page: Page, query: CopyQuery, label: string) {
  let copies: ReturnType<typeof describeCopies> = [];
  await expect
    .poll(
      async () => {
        copies = await page.evaluate(describeCopies, query);
        return copies.length;
      },
      { message: `${label} never rendered` }
    )
    .toBeGreaterThan(0);
  expect(copies, `${label} must render once; copies: ${JSON.stringify(copies)}`).toHaveLength(1);
}

export async function expectRegisterSectionsOnce(page: Page) {
  await expectSingle(page, { kind: 'list', text: '' }, 'Correspondence list');
  await expectSingle(page, { kind: 'caseFields', text: copy.caseFields.title }, 'Case fields');
}

// Waits, duplicate-tolerant, for the claim's row in the shell, then counts copies page-wide.
export async function expectQueueRowOnce(page: Page, claimId: string, when: string) {
  const title = page.getByTestId('role-shell').getByTestId('staff-claim-title');
  await expect(title.filter({ hasText: claimId }).first()).toBeVisible();
  await expectSingle(page, { kind: 'queueRow', text: claimId }, `Queue row ${when}`);
}

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
  await expectQueueRowOnce(page, claimId, 'on first load');
  const row = page.getByTestId('staff-claims-row').filter({
    has: page
      .getByTestId('staff-claims-view')
      .and(page.locator(`a[href$="/staff/claims/${claimId}"]`)),
  });
  const shellRow = page.getByTestId('role-shell').getByTestId('staff-claims-row').and(row);
  await expect(shellRow).toBeVisible();
  return shellRow.getByTestId('staff-claim-overdue-follow-up');
}
