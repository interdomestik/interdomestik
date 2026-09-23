import {
  and,
  auditLog,
  claimDocumentAiExtractionConsents,
  claimDocuments,
  claimInformationRequestEvidence,
  claimInformationRequests,
  claims,
  db,
  eq,
  type TenantTransaction,
  withTenantContext,
} from '@interdomestik/database';
import { randomUUID } from 'node:crypto';

export type UploadCategory = 'evidence' | 'legal';

type AiExtractionConsentCapture = {
  granted: boolean;
  locale: string;
  privacyVersion: string;
  sourceSurface: string;
};

export type PersistClaimDocumentParams = {
  aiExtractionConsent?: AiExtractionConsentCapture;
  category: UploadCategory;
  claimId: string;
  fileId: string;
  fileSize: number;
  logPrefix: string;
  mimeType: string;
  originalName: string;
  resolvedBucket: string;
  storagePath: string;
  tenantId: string;
  userId: string;
  informationRequestId?: string;
};

export class InformationRequestUploadConflictError extends Error {
  constructor() {
    super('Information request changed. Refresh the case and retry.');
    this.name = 'InformationRequestUploadConflictError';
  }
}

function matchesExistingDocument(
  row: typeof claimDocuments.$inferSelect,
  params: PersistClaimDocumentParams
): boolean {
  return (
    row.tenantId === params.tenantId &&
    row.claimId === params.claimId &&
    row.name === params.originalName &&
    row.filePath === params.storagePath &&
    row.fileType === params.mimeType &&
    row.fileSize === params.fileSize &&
    row.bucket === params.resolvedBucket &&
    row.category === params.category &&
    row.uploadedBy === params.userId
  );
}

async function insertRequestLinkedDocument(
  tx: TenantTransaction,
  params: PersistClaimDocumentParams & { informationRequestId: string }
): Promise<boolean> {
  const [claim] = await tx
    .select({ userId: claims.userId })
    .from(claims)
    .where(and(eq(claims.id, params.claimId), eq(claims.tenantId, params.tenantId)))
    .for('update');
  const [request] = await tx
    .select({ id: claimInformationRequests.id })
    .from(claimInformationRequests)
    .where(
      and(
        eq(claimInformationRequests.id, params.informationRequestId),
        eq(claimInformationRequests.claimId, params.claimId),
        eq(claimInformationRequests.tenantId, params.tenantId),
        eq(claimInformationRequests.status, 'open')
      )
    )
    .for('update');
  if (claim?.userId !== params.userId || !request) {
    throw new InformationRequestUploadConflictError();
  }

  // db-access-guard: tenant-scoped -- reason: document values use the tenant validated by the locked claim and open request reads above.
  const [created] = await tx
    .insert(claimDocuments)
    .values({
      id: params.fileId,
      tenantId: params.tenantId,
      claimId: params.claimId,
      name: params.originalName,
      filePath: params.storagePath,
      fileType: params.mimeType,
      fileSize: params.fileSize,
      bucket: params.resolvedBucket,
      category: params.category,
      uploadedBy: params.userId,
    })
    .onConflictDoNothing({ target: claimDocuments.id })
    .returning({ id: claimDocuments.id });

  if (!created) {
    const [existingDocument] = await tx
      .select()
      .from(claimDocuments)
      .where(
        and(
          eq(claimDocuments.id, params.fileId),
          eq(claimDocuments.tenantId, params.tenantId),
          eq(claimDocuments.claimId, params.claimId)
        )
      )
      .limit(1);
    const [existingLink] = await tx
      .select({ requestId: claimInformationRequestEvidence.requestId })
      .from(claimInformationRequestEvidence)
      .where(
        and(
          eq(claimInformationRequestEvidence.documentId, params.fileId),
          eq(claimInformationRequestEvidence.tenantId, params.tenantId),
          eq(claimInformationRequestEvidence.claimId, params.claimId)
        )
      )
      .limit(1);
    if (
      existingDocument &&
      matchesExistingDocument(existingDocument, params) &&
      existingLink?.requestId === params.informationRequestId
    ) {
      return false;
    }
    throw new InformationRequestUploadConflictError();
  }

  // db-access-guard: tenant-scoped -- reason: request evidence values use the tenant validated by the locked claim and open request reads above.
  await tx.insert(claimInformationRequestEvidence).values({
    tenantId: params.tenantId,
    claimId: params.claimId,
    requestId: params.informationRequestId,
    documentId: params.fileId,
    submittedByMemberId: params.userId,
  });
  // db-access-guard: tenant-scoped -- reason: audit values use the tenant and actor validated by the locked claim and open request reads above.
  await tx.insert(auditLog).values({
    id: randomUUID(),
    tenantId: params.tenantId,
    actorId: params.userId,
    actorRole: 'member',
    action: 'claim_information_request.evidence_submitted',
    entityType: 'claim_information_request',
    entityId: params.informationRequestId,
    metadata: { documentId: params.fileId },
  });
  return true;
}

export async function persistClaimDocumentMetadata(
  params: PersistClaimDocumentParams
): Promise<boolean> {
  const persist = async (tx: TenantTransaction): Promise<boolean> => {
    if (params.informationRequestId) {
      const created = await insertRequestLinkedDocument(tx, {
        ...params,
        informationRequestId: params.informationRequestId,
      });
      if (!created) return false;
    } else {
      // db-access-guard: tenant-scoped -- reason: document metadata copies tenant, claim, and uploader scope from the validated upload session.
      await tx.insert(claimDocuments).values({
        id: params.fileId,
        tenantId: params.tenantId,
        claimId: params.claimId,
        name: params.originalName,
        filePath: params.storagePath,
        fileType: params.mimeType,
        fileSize: params.fileSize,
        bucket: params.resolvedBucket,
        category: params.category,
        uploadedBy: params.userId,
      });
    }

    if (params.aiExtractionConsent?.granted === true) {
      const now = new Date();
      // db-access-guard: tenant-scoped -- reason: consent row copies exact tenant, subject, actor, claim, and document scope from the validated upload session.
      await tx.insert(claimDocumentAiExtractionConsents).values({
        id: randomUUID(),
        tenantId: params.tenantId,
        subjectId: params.userId,
        actorId: params.userId,
        claimId: params.claimId,
        documentId: params.fileId,
        consentType: 'ai_document_extraction',
        processingPurpose: 'ai_document_extraction',
        status: 'accepted',
        privacyVersion: params.aiExtractionConsent.privacyVersion,
        locale: params.aiExtractionConsent.locale,
        sourceSurface: params.aiExtractionConsent.sourceSurface,
        recordedAt: now,
        grantedAt: now,
      });
    }
    return true;
  };

  if (params.informationRequestId) {
    return withTenantContext({ tenantId: params.tenantId, role: 'member' }, persist);
  }

  // db-access-guard: tenant-scoped -- reason: ordinary upload transaction writes only document metadata and optional consent rows scoped by validated tenant, user, claim, and document ids.
  return db.transaction(persist);
}
