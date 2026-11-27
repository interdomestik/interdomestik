import { randomUUID } from 'node:crypto';
import { and, dbAdmin, E2E_PASSWORD, E2E_USER_IDS, eq, sql, user } from '@interdomestik/database';
import { claimInboundPilotCases } from '@interdomestik/database/schema';
import type { Browser, Page, TestInfo } from '@playwright/test';
import mkClaims from '../../src/messages/mk/claims.json';
import { fixtureLegalAcceptance } from '../fixtures/legal-acceptance.fixture';
import {
  assertStoredDoorDocument,
  doorDocuments,
  requireDoorActor,
} from '../fixtures/one-door-data.fixture';
import { expect, requestFromDoor } from '../fixtures/one-door.fixture';
import { pdf } from '../fixtures/one-door-upload.fixture';
import { path as routePath } from '../fixtures/routes';
import { gotoApp } from '../utils/navigation';
import {
  documentPaths,
  fileName,
  inboundPdf,
  requireLocalPilotProof,
  type MkCase,
} from './claim-correspondence-inbound.fixture';

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

export async function signInSecondMember(
  page: Page,
  origin: string,
  member: MemberFixture,
  info: TestInfo
) {
  await gotoApp(page, new URL(routePath(info, '/login')), info, { baseURL: origin });
  const login = await requestFromDoor(page, `${origin}/api/auth/sign-in/email`, {
    email: member.email,
    password: E2E_PASSWORD,
  });
  expect(login.status).toBe(200);
  expect(JSON.parse(login.body.toString('utf8')).user.id).toBe(member.id);
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

export async function expectBothDocumentGetsDenied(
  page: Page,
  origin: string,
  id: string,
  statuses: number[]
) {
  const expectDenied = async (path: string) => {
    const result = await requestFromDoor(page, origin + path);
    expect(statuses).toContain(result.status);
    expect(result.contentType).toContain('application/json');
    expect(Object.keys(JSON.parse(result.body.toString('utf8')))).toEqual(['error']);
  };
  await documentPaths(id).reduce(
    (previous, path) => previous.then(() => expectDenied(path)),
    Promise.resolve()
  );
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
  if (url?.origin !== storage.origin || !url.searchParams.has('token')) {
    throw new Error('Expected a real local signed download');
  }
  const bytes = await fetch(url, { redirect: 'error' }).catch(() => null);
  expect(bytes?.status).toBe(200);
  if (!bytes) throw new Error('Missing signed download response');
  expect(Buffer.from(await bytes.arrayBuffer())).toEqual(pdf);
}
