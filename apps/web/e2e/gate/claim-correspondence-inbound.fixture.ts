import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  and,
  claims,
  createAdminClient,
  dbAdmin,
  E2E_PASSWORD,
  E2E_USER_IDS,
  eq,
  sql,
  user,
} from '@interdomestik/database';
import { claimInboundPilotCases } from '@interdomestik/database/schema';
import { readDisposableTargetClass } from '@interdomestik/database/seed-target-classification';
import type { Browser, Locator, Page, TestInfo } from '@playwright/test';
import { resolveEvidenceBucketName } from '../../src/lib/storage/evidence-bucket';
import mk from '../../src/messages/mk/staff-correspondence.json';
import mkClaims from '../../src/messages/mk/claims.json';
import { fixtureLegalAcceptance } from '../fixtures/legal-acceptance.fixture';
import { assertStoredDoorDocument, requireDoorActor } from '../fixtures/one-door-data.fixture';
import { expect, requestFromDoor } from '../fixtures/one-door.fixture';
import { pdf } from '../fixtures/one-door-upload.fixture';
import { gotoApp } from '../utils/navigation';
import { occurred, registerRow } from './claim-correspondence.fixture';

export const mkCopy = mk['staff-correspondence'];
export const fileName = 'synthetic-insurer-receipt.pdf';
export const inboundPdf = { name: fileName, mimeType: 'application/pdf', buffer: pdf };

function loopback(url: URL) {
  return (
    /^(localhost|127\.0\.0\.1|\[::1\]|[-a-z0-9.]+\.(localhost|127\.0\.0\.1\.nip\.io))$/i.test(
      url.hostname
    ) &&
    ['http:', 'https:'].includes(url.protocol) &&
    !url.username &&
    !url.password
  );
}

export function requireLocalPilotProof(origin: string) {
  const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'invalid:');
  if (
    process.env.PW_EXTERNAL_SERVER !== '1' ||
    process.env.INTERDOMESTIK_E2E_FAKE_STORAGE_SIGNING !== '0' ||
    readDisposableTargetClass(process.env) !== 'local' ||
    !process.env.E2E_SERVER_DATABASE_URL_RLS ||
    readDisposableTargetClass({
      ...process.env,
      DATABASE_URL: process.env.E2E_SERVER_DATABASE_URL_RLS,
    }) !== 'local' ||
    !loopback(storage) ||
    !loopback(new URL(origin))
  ) {
    throw new Error(
      'WP-12.1 pre-check requires a loopback app, restricted database, and real storage'
    );
  }
  return storage;
}

export async function createMkCase() {
  const staff = await requireDoorActor('MK_STAFF');
  if (!staff.tenantId || !staff.branchId) throw new Error('Missing MK staff scope');
  const id = `wp12-mk-${randomUUID()}`;
  await dbAdmin.insert(claims).values({
    id,
    title: id,
    tenantId: staff.tenantId,
    accessTenantId: staff.tenantId,
    userId: E2E_USER_IDS.MK_MEMBER,
    staffId: staff.id,
    branchId: staff.branchId,
    category: 'vehicle',
    companyName: 'Synthetic Insurance',
    caseLifecycleState: 'verification',
    recoveryLifecycleState: 'not_started',
  });
  return { id, tenantId: staff.tenantId };
}

export type MkCase = Awaited<ReturnType<typeof createMkCase>>;
export type MemberFixture = { id: string; email: string; tenantId: string };

export async function createSecondMkMember(): Promise<MemberFixture> {
  const seed = await requireDoorActor('MK_MEMBER');
  if (!seed.tenantId) throw new Error('Missing MK member tenant');
  const id = `wp12-member-${randomUUID()}`;
  const member = { id, email: `${id}@example.test`, tenantId: seed.tenantId };
  await dbAdmin.transaction(async tx => {
    await tx.insert(user).values({
      ...member,
      name: 'Synthetic WP-12.1 member',
      branchId: seed.branchId,
      role: 'member',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const copied = await tx.execute(sql`
      insert into "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      select ${id}, ${member.email}, 'credential', ${id}, password, now(), now()
      from "account" where "userId" = ${seed.id} and "providerId" = 'credential' and password is not null
      returning id
    `);
    expect(copied).toHaveLength(1);
  });
  await fixtureLegalAcceptance('seed', [member]);
  return member;
}

export async function openCleanContext(browser: Browser, origin: string) {
  const context = await browser.newContext({
    baseURL: origin,
    storageState: { cookies: [], origins: [] },
    ignoreHTTPSErrors: true,
  });
  await context.addCookies([{ name: 'cookie_consent', value: 'accepted', url: origin }]);
  return context;
}

export async function signInSecondMember(page: Page, origin: string, member: MemberFixture) {
  await page.goto(`${origin}/mk/login`);
  const login = await requestFromDoor(page, `${origin}/api/auth/sign-in/email`, {
    email: member.email,
    password: E2E_PASSWORD,
  });
  expect(login.status).toBe(200);
  expect(JSON.parse(login.body.toString('utf8')).user.id).toBe(member.id);
}

export async function enrollMkCase(claim: MkCase) {
  await dbAdmin.insert(claimInboundPilotCases).values({
    claimId: claim.id,
    tenantId: claim.tenantId,
    enrolledAt: new Date(),
    legacyCredentialDisposition: 'none-issued',
  });
}

export async function transferMkCase(claim: MkCase, ownerId: string) {
  const roleName = decodeURIComponent(new URL(process.env.E2E_SERVER_DATABASE_URL_RLS!).username);
  return dbAdmin
    .transaction(async tx => {
      await tx.execute(sql`set local role ${sql.identifier(roleName)}`);
      await tx.execute(sql`set local row_security = on`);
      const [role] = await tx.execute<{ restricted: boolean }>(sql`
      select not rolsuper and not rolbypassrls as restricted from pg_roles where rolname = current_user
    `);
      expect(role?.restricted).toBe(true);
      await tx.execute(sql`select set_config('app.current_tenant_id', ${claim.tenantId}, true),
      set_config('app.current_access_tenant_id', ${claim.tenantId}, true)`);
      const changed = await tx
        .update(claims)
        .set({ userId: ownerId })
        .where(and(eq(claims.id, claim.id), eq(claims.tenantId, claim.tenantId)))
        .returning({ ownerId: claims.userId });
      expect(changed).toEqual([{ ownerId }]);
    })
    .catch((error: unknown) => {
      // The driver cause supplies SQLSTATE. Keep query parameters out of Playwright output.
      if (
        error instanceof Error &&
        error.cause &&
        typeof error.cause === 'object' &&
        'code' in error.cause
      ) {
        throw new Error(String(error.cause.code));
      }
      throw error;
    });
}

export async function staffPilotForm(
  page: Page,
  origin: string,
  locale: string,
  claim: MkCase,
  info: TestInfo
) {
  await gotoApp(page, `/${locale}/staff/claims/${claim.id}`, info, {
    baseURL: origin,
    marker: 'staff-claim-detail-ready',
  });
  const form = page.getByRole('form', { name: mkCopy.inbound.title });
  await expect(form).toBeVisible();
  return form;
}

export async function approvePdf(form: Locator, officeRef: string, file = inboundPdf) {
  const reference = form.getByLabel(mkCopy.inbound.decisionRef);
  const previous = await reference.inputValue();
  await form.getByLabel(mkCopy.inbound.file).setInputFiles(file);
  await form.getByLabel(mkCopy.inbound.officeRef).fill(officeRef);
  await form.getByRole('button', { name: mkCopy.inbound.intended }).click();
  await expect(reference).not.toHaveValue(previous);
  await expect(reference).toHaveValue(/^[0-9a-f-]{36}$/);
  return reference.inputValue();
}

export async function proveMemberUploadDuringRollback(
  member: Page,
  origin: string,
  locale: string,
  claim: MkCase,
  info: TestInfo
) {
  const paused = await dbAdmin
    .update(claimInboundPilotCases)
    .set({ paused: true })
    .where(
      and(
        eq(claimInboundPilotCases.tenantId, claim.tenantId),
        eq(claimInboundPilotCases.claimId, claim.id)
      )
    )
    .returning({ id: claimInboundPilotCases.claimId });
  expect(paused).toEqual([{ id: claim.id }]);

  const response = await requestFromDoor(member, origin + '/api/uploads', {
    claimId: claim.id,
    fileName,
    fileType: inboundPdf.mimeType,
    fileSize: inboundPdf.buffer.length,
  });
  expect(response.status).toBe(200);

  const title = mkClaims.claims.claimsPro.actions.uploadEvidence;
  await gotoApp(member, `/${locale}/member/documents`, info, {
    baseURL: origin,
    marker: 'member-documents-page-ready',
  });
  await member.getByTestId(`member-documents-upload-${claim.id}`).click();
  const dialog = member.getByRole('dialog', { name: title });
  await dialog.getByLabel(mkClaims.claims.detail.evidenceUpload.file).setInputFiles(inboundPdf);
  await dialog.getByRole('button', { name: title, exact: true }).click();
  await expect(dialog).toBeHidden();
  const [document, ...rest] = await doorDocuments(claim.id);
  expect(rest).toHaveLength(0);
  expect(document).toMatchObject({ name: fileName, uploadedBy: E2E_USER_IDS.MK_MEMBER });
  await assertStoredDoorDocument(document, inboundPdf.buffer);
}

export async function publishPdf(form: Locator) {
  await form.getByRole('button', { name: mkCopy.inbound.upload }).click();
  await expect(form.getByLabel(mkCopy.inbound.decisionRef)).toHaveValue('');
  await expect(form.getByRole('status')).toHaveText(mkCopy.feedback.saved);
}

export function documentPaths(id: string) {
  const base = `/api/documents/${encodeURIComponent(id)}`;
  return [base, `${base}/download`] as const;
}

export async function expectBothDocumentGetsDenied(
  page: Page,
  origin: string,
  id: string,
  statuses: number[]
) {
  for (const path of documentPaths(id)) {
    const result = await requestFromDoor(page, origin + path);
    expect(statuses).toContain(result.status);
    expect(result.contentType).toContain('application/json');
    expect(Object.keys(JSON.parse(result.body.toString('utf8')))).toEqual(['error']);
  }
}

export async function expectMemberOpensPdf(
  page: Page,
  origin: string,
  locale: string,
  claim: MkCase,
  document: Parameters<typeof assertStoredDoorDocument>[0],
  info: TestInfo
) {
  const storage = requireLocalPilotProof(origin);
  await gotoApp(page, `/${locale}/member/claims/${claim.id}`, info, {
    baseURL: origin,
    marker: 'member-claim-progress-summary',
  });
  const [signedPath, downloadPath] = documentPaths(document.id);
  const row = page.getByTestId('ops-document-row').filter({ hasText: fileName });
  const inlinePath = `${downloadPath}?disposition=inline`;
  await expect(row.getByRole('link')).toHaveAttribute('href', inlinePath);
  await expect(page.getByTestId('member-vault-consent').getByRole('listitem')).toHaveCount(1);
  const opened = await requestFromDoor(page, origin + inlinePath);
  expect(opened.status).toBe(200);
  expect(opened.body).toEqual(pdf);

  const signed = await requestFromDoor(page, origin + signedPath);
  expect(signed.status).toBe(200);
  const response: unknown = JSON.parse(signed.body.toString('utf8'));
  const url =
    response &&
    typeof response === 'object' &&
    'url' in response &&
    typeof response.url === 'string'
      ? URL.parse(response.url)
      : null;
  if (!url || url.origin !== storage.origin || !url.searchParams.has('token')) {
    throw new Error('Expected a real local signed download');
  }
  const bytes = await fetch(url, { redirect: 'error' }).catch(() => null);
  expect(bytes?.status).toBe(200);
  if (!bytes) throw new Error('Missing signed download response');
  expect(Buffer.from(await bytes.arrayBuffer())).toEqual(pdf);
}

export async function recordReceivedPdf(page: Page, documentId: string) {
  const form = page.getByRole('form', { name: mkCopy.entry.title });
  const summary = 'Synthetic insurer PDF received';
  await form.getByLabel(mkCopy.entry.directionLabel).selectOption('inbound');
  await form.getByLabel(mkCopy.entry.occurredUtc).fill(occurred);
  await form.getByLabel(mkCopy.entry.organisation, { exact: true }).fill('Synthetic Insurance');
  await form.getByLabel(mkCopy.entry.body).fill(summary);
  await form.getByRole('button', { name: mkCopy.inbound.find }).click();
  await form.getByRole('checkbox', { name: fileName, exact: true }).check();
  await form.getByRole('button', { name: mkCopy.entry.record }).click();
  const row = registerRow(page, summary);
  await expect(row).toBeVisible();
  await page.reload();
  await expect(row.getByText(mkCopy.inbound.received, { exact: true })).toBeVisible();
  const link = row.getByRole('link', { name: fileName });
  await expect(link).toHaveAttribute('href', documentPaths(documentId)[1]);
  const download = page.waitForEvent('download');
  await link.click();
  expect(await readFile(await (await download).path())).toEqual(pdf);
}

export async function listMkObjects(claim: MkCase) {
  const bucket = createAdminClient().storage.from(resolveEvidenceBucketName());
  const result = await bucket.list(`pii/tenants/${claim.tenantId}/claims/${claim.id}`);
  if (result.error) throw new Error('Could not list the synthetic case storage prefix');
  return result.data;
}

export async function placeApprovedPdf(bucket: string, path: string) {
  const result = await createAdminClient().storage.from(bucket).upload(path, inboundPdf.buffer, {
    contentType: inboundPdf.mimeType,
    upsert: false,
  });
  if (result.error) throw new Error('Could not prepare the interrupted synthetic upload');
}
