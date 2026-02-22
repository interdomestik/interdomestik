import { E2E_PASSWORD, E2E_USERS, claimDocuments, db, eq, user } from '@interdomestik/database';
import { getMessagesForClaimCore } from '@interdomestik/domain-communications/messages/get';
import { sendMessageDbCore } from '@interdomestik/domain-communications/messages/send';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';

import { createSignedUploadCore } from '@/app/api/uploads/_core';

const MK_HOST = process.env.MK_HOST ?? 'mk.127.0.0.1.nip.io:3000';

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
    where: eq(claimDocuments.tenantId, E2E_USERS.KS_MEMBER.tenantId),
    columns: { id: true, claimId: true, tenantId: true },
    orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)],
    limit: 40,
  });

  for (const document of ksDocuments) {
    const message = await db.query.claimMessages.findFirst({
      where: (table, { and, eq: eqInner }) =>
        and(eqInner(table.claimId, document.claimId), eqInner(table.tenantId, document.tenantId)),
      columns: { id: true, claimId: true, tenantId: true },
      orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)],
    });

    if (!message) {
      continue;
    }

    const claim = await db.query.claims.findFirst({
      where: (table, { and, eq: eqInner }) =>
        and(eqInner(table.id, document.claimId), eqInner(table.tenantId, document.tenantId)),
      columns: { id: true, tenantId: true, title: true },
    });

    if (!claim) {
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

async function loginMkAdmin(page: Page) {
  await page.goto('/mk/login', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-email').fill(E2E_USERS.MK_ADMIN.email);
  await page.getByTestId('login-password').fill(E2E_PASSWORD);
  await page.getByTestId('login-submit').click();
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
    where: eq(user.email, E2E_USERS.MK_ADMIN.email),
    columns: { id: true, role: true, tenantId: true },
  });
  if (!mkAdmin?.id || mkAdmin.tenantId !== E2E_USERS.MK_ADMIN.tenantId) {
    throw new Error('Expected seeded MK admin user');
  }

  const mkContext = await browser.newContext({
    baseURL: `http://${MK_HOST}`,
    extraHTTPHeaders: { 'x-forwarded-host': MK_HOST },
    locale: 'mk-MK',
  });
  const mkAdminPage = await mkContext.newPage();

  try {
    await loginMkAdmin(mkAdminPage);

    const claimResponse = await mkAdminPage.goto(
      `/mk/admin/claims/${encodeURIComponent(ksClaim.id)}`,
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
      requestHeaders: new Headers({ 'x-forwarded-host': MK_HOST }),
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
