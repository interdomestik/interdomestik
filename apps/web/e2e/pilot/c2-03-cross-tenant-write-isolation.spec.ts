import {
  E2E_USERS,
  and,
  claimDocuments,
  claimMessages,
  claims,
  db,
  eq,
  user,
} from '@interdomestik/database';
import { updateClaimStatusCore as updateAdminClaimStatusCore } from '@interdomestik/domain-claims/admin-claims/update-status';
import { sendMessageDbCore } from '@interdomestik/domain-communications/messages/send';
import { expect, test } from '../fixtures/auth.fixture';

import { createSignedUploadCore } from '@/app/api/uploads/_core';

const ACTOR_HOST = process.env.C2_ACTOR_HOST ?? process.env.MK_HOST ?? 'mk.127.0.0.1.nip.io:3000';
const ACTOR_ADMIN_EMAIL = process.env.C2_ACTOR_EMAIL ?? E2E_USERS.MK_ADMIN.email;
const ACTOR_ADMIN_TENANT_ID = process.env.C2_ACTOR_TENANT_ID ?? E2E_USERS.MK_ADMIN.tenantId;
const TARGET_TENANT_ID = process.env.C2_TARGET_TENANT_ID ?? E2E_USERS.KS_MEMBER.tenantId;

type SessionUser = {
  id: string;
  role: string | null;
  tenantId: string | null;
};

type AdminSession = {
  user: {
    id: string;
    role?: string | null;
    tenantId?: string | null;
  };
};

type AdminClaimStatus = Parameters<typeof updateAdminClaimStatusCore>[0]['newStatus'];

type KsClaimTarget = {
  claimId: string;
  claimTitle: string;
  claimStatus: string | null;
  documentId: string;
};

function pickAlternateStatus(currentStatus: string | null): AdminClaimStatus {
  const candidates: AdminClaimStatus[] = [
    'verification',
    'evaluation',
    'negotiation',
    'resolved',
    'rejected',
    'submitted',
  ];

  for (const candidate of candidates) {
    if (candidate !== currentStatus) {
      return candidate;
    }
  }

  return 'verification';
}

async function findKsClaimTarget(): Promise<KsClaimTarget> {
  const ksDocuments = await db.query.claimDocuments.findMany({
    where: eq(claimDocuments.tenantId, TARGET_TENANT_ID),
    columns: { id: true, claimId: true },
    orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)],
    limit: 40,
  });

  if (ksDocuments.length === 0) {
    throw new Error('Expected seeded KS claim document to exist');
  }

  const claimIds = Array.from(new Set(ksDocuments.map(document => document.claimId)));

  const ksClaims = await db.query.claims.findMany({
    where: (table, { and: andInner, eq: eqInner, inArray: inArrayInner }) =>
      andInner(inArrayInner(table.id, claimIds), eqInner(table.tenantId, TARGET_TENANT_ID)),
    columns: { id: true, title: true, status: true },
  });

  const claimById = new Map(ksClaims.map(claim => [claim.id, claim]));

  for (const document of ksDocuments) {
    const claim = claimById.get(document.claimId);
    if (!claim) {
      continue;
    }

    return {
      claimId: claim.id,
      claimTitle: claim.title,
      claimStatus: claim.status,
      documentId: document.id,
    };
  }

  throw new Error('Expected seeded KS claim with document to exist');
}

test.describe.configure({ mode: 'serial' });

test('C2-03: cross-tenant write attempts are denied without mutation', async () => {
  const target = await findKsClaimTarget();

  const mkAdmin = await db.query.user.findFirst({
    where: and(eq(user.email, ACTOR_ADMIN_EMAIL), eq(user.tenantId, ACTOR_ADMIN_TENANT_ID)),
    columns: { id: true, role: true, tenantId: true },
  });
  if (!mkAdmin?.id || mkAdmin.tenantId !== ACTOR_ADMIN_TENANT_ID) {
    throw new Error('Expected seeded actor admin user');
  }

  const actorSession = {
    user: {
      id: mkAdmin.id,
      role: mkAdmin.role,
      tenantId: mkAdmin.tenantId,
    },
  } satisfies { user: SessionUser };

  const originalStatus = target.claimStatus;
  const attemptedStatus = pickAlternateStatus(originalStatus);

  await expect(
    updateAdminClaimStatusCore({
      claimId: target.claimId,
      newStatus: attemptedStatus,
      session: actorSession as AdminSession,
      requestHeaders: new Headers({ 'x-forwarded-host': ACTOR_HOST }),
    })
  ).rejects.toThrow('Claim not found');

  const persistedClaim = await db.query.claims.findFirst({
    where: and(eq(claims.id, target.claimId), eq(claims.tenantId, TARGET_TENANT_ID)),
    columns: { status: true },
  });
  expect(persistedClaim?.status ?? null).toBe(originalStatus ?? null);

  const messageProbe = `C2-03 cross-tenant message probe ${Date.now()}`;
  const messageResult = await sendMessageDbCore({
    session: actorSession,
    requestHeaders: new Headers({ 'x-forwarded-host': ACTOR_HOST }),
    claimId: target.claimId,
    content: messageProbe,
    isInternal: false,
  });
  expect(messageResult.success).toBe(false);
  if (messageResult.success) {
    throw new Error('Expected cross-tenant message post to be denied');
  }
  expect(messageResult.error).toBe('Claim not found');

  const persistedProbeMessage = await db.query.claimMessages.findFirst({
    where: and(
      eq(claimMessages.claimId, target.claimId),
      eq(claimMessages.tenantId, TARGET_TENANT_ID),
      eq(claimMessages.content, messageProbe)
    ),
    columns: { id: true },
  });
  expect(persistedProbeMessage).toBeUndefined();

  const uploadProbeName = `c2-03-cross-tenant-upload-${Date.now()}.pdf`;
  const uploadResult = await createSignedUploadCore({
    session: actorSession as AdminSession,
    input: {
      fileName: uploadProbeName,
      fileType: 'application/pdf',
      fileSize: 1024,
      claimId: target.claimId,
    },
    bucket: 'claim-evidence',
  });
  expect(uploadResult.ok).toBe(false);
  if (uploadResult.ok) {
    throw new Error('Expected cross-tenant upload-signing to be denied');
  }
  expect(uploadResult.status).toBe(404);
  expect(uploadResult.error).toBe('Claim not found');

  const persistedProbeDocument = await db.query.claimDocuments.findFirst({
    where: and(
      eq(claimDocuments.claimId, target.claimId),
      eq(claimDocuments.tenantId, TARGET_TENANT_ID),
      eq(claimDocuments.name, uploadProbeName)
    ),
    columns: { id: true },
  });
  expect(persistedProbeDocument).toBeUndefined();

  console.log('MARKER_C2_03_STATUS_WRITE_DENIED');
  console.log('MARKER_C2_03_MESSAGE_WRITE_DENIED');
  console.log('MARKER_C2_03_UPLOAD_WRITE_DENIED');
  console.log(`C2_03_TARGET_CLAIM_ID=${target.claimId}`);
  console.log(`C2_03_TARGET_DOCUMENT_ID=${target.documentId}`);
  console.log(`C2_03_TARGET_CLAIM_TITLE=${target.claimTitle}`);
});
