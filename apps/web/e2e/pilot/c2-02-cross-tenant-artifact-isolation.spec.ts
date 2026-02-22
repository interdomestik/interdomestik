import {
  E2E_PASSWORD,
  E2E_USERS,
  and,
  claimDocuments,
  db,
  eq,
  user,
} from '@interdomestik/database';
import { getMessagesForClaimCore } from '@interdomestik/domain-communications/messages/get';
import { sendMessageDbCore } from '@interdomestik/domain-communications/messages/send';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';

import { createSignedUploadCore } from '@/app/api/uploads/_core';

const ACTOR_HOST = process.env.C2_ACTOR_HOST ?? process.env.MK_HOST ?? 'mk.127.0.0.1.nip.io:3000';
const ACTOR_LOGIN_PATH = process.env.C2_ACTOR_LOGIN_PATH ?? '/mk/login';
const ACTOR_ADMIN_OVERVIEW_PATH = process.env.C2_ACTOR_ADMIN_OVERVIEW_PATH ?? '/mk/admin/overview';
const ACTOR_ADMIN_CLAIMS_PREFIX = process.env.C2_ACTOR_ADMIN_CLAIMS_PREFIX ?? '/mk/admin/claims';
const ACTOR_ADMIN_EMAIL = process.env.C2_ACTOR_EMAIL ?? E2E_USERS.MK_ADMIN.email;
const ACTOR_ADMIN_TENANT_ID = process.env.C2_ACTOR_TENANT_ID ?? E2E_USERS.MK_ADMIN.tenantId;
const TARGET_TENANT_ID = process.env.C2_TARGET_TENANT_ID ?? E2E_USERS.KS_MEMBER.tenantId;

type SessionUser = {
  id: string;
  role: string | null;
  tenantId: string | null;
};

type KsClaimArtifacts = {
  claimId: string;
  tenantId: string;
  title: string;
  documentId: string;
  messageId: string;
};

async function findKsClaimWithArtifacts(): Promise<KsClaimArtifacts> {
  const ksDocuments = await db.query.claimDocuments.findMany({
    where: eq(claimDocuments.tenantId, TARGET_TENANT_ID),
    columns: { id: true, claimId: true, tenantId: true },
    orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)],
    limit: 40,
  });

  if (ksDocuments.length === 0) {
    throw new Error('Expected seeded KS claim with linked document and message');
  }

  const claimIds = Array.from(new Set(ksDocuments.map(document => document.claimId)));

  const ksMessages = await db.query.claimMessages.findMany({
    where: (table, { and: andInner, eq: eqInner, inArray: inArrayInner }) =>
      andInner(inArrayInner(table.claimId, claimIds), eqInner(table.tenantId, TARGET_TENANT_ID)),
    columns: { id: true, claimId: true, tenantId: true },
    orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)],
  });

  const ksClaims = await db.query.claims.findMany({
    where: (table, { and: andInner, eq: eqInner, inArray: inArrayInner }) =>
      andInner(inArrayInner(table.id, claimIds), eqInner(table.tenantId, TARGET_TENANT_ID)),
    columns: { id: true, tenantId: true, title: true },
  });

  const messageByClaimId = new Map<string, (typeof ksMessages)[number]>();
  for (const message of ksMessages) {
    if (!messageByClaimId.has(message.claimId)) {
      messageByClaimId.set(message.claimId, message);
    }
  }
  const claimById = new Map(ksClaims.map(claim => [claim.id, claim]));

  for (const document of ksDocuments) {
    const message = messageByClaimId.get(document.claimId);
    const claim = claimById.get(document.claimId);
    if (!message || !claim) {
      continue;
    }

    return {
      claimId: claim.id,
      tenantId: claim.tenantId,
      title: claim.title,
      documentId: document.id,
      messageId: message.id,
    };
  }

  throw new Error('Expected seeded KS claim with linked document and message');
}

async function loginActorAdmin(page: Page) {
  const origin = `http://${ACTOR_HOST}`;
  const response = await page.request.post(new URL('/api/auth/sign-in/email', origin).toString(), {
    data: {
      email: ACTOR_ADMIN_EMAIL,
      password: E2E_PASSWORD,
    },
    headers: {
      Origin: origin,
      Referer: `${origin}${ACTOR_LOGIN_PATH}`,
      'x-forwarded-host': ACTOR_HOST,
    },
  });
  expect(response.ok(), `Expected API login success for ${ACTOR_ADMIN_EMAIL}`).toBe(true);
  await page.goto(ACTOR_ADMIN_OVERVIEW_PATH, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/(?:mk\/)?admin(?:\/overview)?(?:[/?#]|$)/, { timeout: 30_000 });
}

async function isIsolationDenied(page: Page, statusCode: number) {
  if ([401, 403, 404].includes(statusCode)) return true;
  if (/\/(?:mk\/)?login(?:[/?#]|$)/i.test(page.url())) return true;

  const hasNotFoundPage = await page
    .getByTestId('not-found-page')
    .isVisible()
    .catch(() => false);
  if (hasNotFoundPage) return true;

  const html = await page.content();
  return (
    html.includes('NEXT_HTTP_ERROR_FALLBACK;404') || html.includes('data-testid=\"not-found-page\"')
  );
}

test.describe.configure({ mode: 'serial' });

test('C2-02: cross-tenant IDs denied for claim/doc/upload/message', async ({ browser }) => {
  const ksArtifacts = await findKsClaimWithArtifacts();
  const ksClaim = {
    id: ksArtifacts.claimId,
    tenantId: ksArtifacts.tenantId,
    title: ksArtifacts.title,
  };
  const ksDocument = {
    id: ksArtifacts.documentId,
    tenantId: ksArtifacts.tenantId,
    claimId: ksArtifacts.claimId,
  };
  const ksMessage = {
    id: ksArtifacts.messageId,
    tenantId: ksArtifacts.tenantId,
    claimId: ksArtifacts.claimId,
  };

  const mkAdmin = await db.query.user.findFirst({
    where: and(eq(user.email, ACTOR_ADMIN_EMAIL), eq(user.tenantId, ACTOR_ADMIN_TENANT_ID)),
    columns: { id: true, role: true, tenantId: true },
  });
  if (!mkAdmin?.id || mkAdmin.tenantId !== ACTOR_ADMIN_TENANT_ID) {
    throw new Error('Expected seeded actor admin user');
  }

  const mkContext = await browser.newContext({
    baseURL: `http://${ACTOR_HOST}`,
    extraHTTPHeaders: { 'x-forwarded-host': ACTOR_HOST },
    locale: 'mk-MK',
  });
  const mkAdminPage = await mkContext.newPage();

  try {
    await loginActorAdmin(mkAdminPage);

    const claimResponse = await mkAdminPage.goto(
      `${ACTOR_ADMIN_CLAIMS_PREFIX}/${encodeURIComponent(ksClaim.id)}`,
      { waitUntil: 'domcontentloaded' }
    );
    const claimStatus = claimResponse?.status() ?? 0;
    const claimDenied = await isIsolationDenied(mkAdminPage, claimStatus);
    expect(
      claimDenied,
      `Expected MK admin to be denied KS claim ID ${ksClaim.id}, got status=${claimStatus}, url=${mkAdminPage.url()}`
    ).toBe(true);

    const hasClaimState = await mkAdminPage
      .getByTestId(`admin-claim-status-${ksClaim.id}`)
      .isVisible()
      .catch(() => false);
    expect(hasClaimState, `MK admin must not see KS claim state for ${ksClaim.id}`).toBe(false);

    const documentMetaResponse = await mkContext.request.get(
      `/api/documents/${encodeURIComponent(ksDocument.id)}`
    );
    expect(
      [403, 404],
      `Expected MK admin denied for KS document metadata ${ksDocument.id}, got ${documentMetaResponse.status()}`
    ).toContain(documentMetaResponse.status());

    const documentDownloadResponse = await mkContext.request.get(
      `/api/documents/${encodeURIComponent(ksDocument.id)}/download`
    );
    expect(
      [403, 404],
      `Expected MK admin denied for KS document download ${ksDocument.id}, got ${documentDownloadResponse.status()}`
    ).toContain(documentDownloadResponse.status());

    const mkSession = {
      user: {
        id: mkAdmin.id,
        role: mkAdmin.role,
        tenantId: mkAdmin.tenantId,
      },
    };

    const uploadResult = await createSignedUploadCore({
      session: mkSession,
      input: {
        fileName: 'c2-02-proof.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        claimId: ksClaim.id,
      },
      bucket: 'claim-evidence',
    });
    expect(uploadResult.ok).toBe(false);
    if (uploadResult.ok) {
      throw new Error('Expected upload core to reject cross-tenant claimId');
    }
    expect(uploadResult.status).toBe(404);
    expect(uploadResult.error).toBe('Claim not found');

    const messageReadResult = await getMessagesForClaimCore({
      session: mkSession as { user: SessionUser },
      claimId: ksClaim.id,
    });
    expect(messageReadResult.success).toBe(false);
    expect(messageReadResult.error).toBe('Claim not found');

    const messageSendResult = await sendMessageDbCore({
      session: mkSession as { user: SessionUser },
      requestHeaders: new Headers({ 'x-forwarded-host': ACTOR_HOST }),
      claimId: ksClaim.id,
      content: `C2-02 denial probe ${Date.now()}`,
      isInternal: false,
    });
    expect(messageSendResult.success).toBe(false);
    if (messageSendResult.success) {
      throw new Error('Expected sendMessageDbCore to reject cross-tenant claimId');
    }
    expect(messageSendResult.error).toBe('Claim not found');

    console.log('MARKER_C2_02_CLAIM_DENIED');
    console.log('MARKER_C2_02_DOCUMENT_DENIED');
    console.log('MARKER_C2_02_UPLOAD_DENIED');
    console.log('MARKER_C2_02_MESSAGE_DENIED');
    console.log(`C2_02_KS_CLAIM_ID=${ksClaim.id}`);
    console.log(`C2_02_KS_DOCUMENT_ID=${ksDocument.id}`);
    console.log(`C2_02_KS_MESSAGE_ID=${ksMessage.id}`);
    console.log(`C2_02_CLAIM_ROUTE_STATUS=${claimStatus}`);
    console.log(`C2_02_DOCUMENT_META_STATUS=${documentMetaResponse.status()}`);
    console.log(`C2_02_DOCUMENT_DOWNLOAD_STATUS=${documentDownloadResponse.status()}`);
  } finally {
    await mkContext.close();
  }
});
