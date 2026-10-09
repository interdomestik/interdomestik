import {
  and,
  auditLog,
  claimDocumentAiExtractionConsents,
  claimDocuments,
  claimInformationRequestEvidence,
  claimInformationRequests,
  claims,
  eq,
  type TenantTransaction,
  withTenantContext,
} from '@interdomestik/database';
import { randomUUID } from 'node:crypto';
import { ClaimDocumentUploadConflictError } from './claim-document-upload-conflict';
export { ClaimDocumentUploadConflictError } from './claim-document-upload-conflict';

export type UploadCategory = 'evidence' | 'legal';

type AiExtractionConsentCapture = {
  granted: boolean;
  locale: string;
  privacyVersion: string;
  sourceSurface: string;
};

export type PersistClaimDocumentParams = {
  /**
   * Trusted, server-derived role of the confirming actor. Member confirmations preserve the
   * canonical member actor; other admitted upload actors retain their verified session role.
   * Required for ordinary uploads. Optional only so request-linked member writes keep their fixed
   * member transaction role; a non-member role is rejected for that member-only path.
   */
  actorRole?: string;
  aiExtractionConsent?: AiExtractionConsentCapture;
  /** Trusted member-surface owner expectation; never accepted from the confirmation payload. */
  expectedClaimOwnerId?: string;
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

export class ClaimDocumentActorRoleError extends Error {
  constructor() {
    super('A trusted upload actor role is required to persist claim document metadata.');
    this.name = 'ClaimDocumentActorRoleError';
  }
}

function resolveMetadataTransactionRole(params: PersistClaimDocumentParams): string {
  if (params.informationRequestId) {
    // Request-linked evidence is a member-only write whose audit row records actorRole 'member'.
    if (params.actorRole && params.actorRole !== 'member') throw new ClaimDocumentActorRoleError();
    return 'member';
  }
  if (!params.actorRole) throw new ClaimDocumentActorRoleError();
  return params.actorRole;
}

function documentValues(params: PersistClaimDocumentParams) {
  return {
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
  };
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

/**
 * Reads only the caller's own document for this exact tenant, claim, and uploader. A row with the
 * same id outside that scope reads as absent, so the replay fails closed without exposing it.
 */
async function existingDocumentMatches(
  tx: TenantTransaction,
  params: PersistClaimDocumentParams
): Promise<boolean> {
  const [existingDocument] = await tx
    .select()
    .from(claimDocuments)
    .where(
      and(
        eq(claimDocuments.id, params.fileId),
        eq(claimDocuments.tenantId, params.tenantId),
        eq(claimDocuments.claimId, params.claimId),
        eq(claimDocuments.uploadedBy, params.userId)
      )
    )
    .limit(1);
  return Boolean(existingDocument && matchesExistingDocument(existingDocument, params));
}

async function insertOrdinaryDocument(
  tx: TenantTransaction,
  params: PersistClaimDocumentParams
): Promise<boolean> {
  if (params.expectedClaimOwnerId !== undefined) {
    const [claim] = await tx
      .select({ userId: claims.userId })
      .from(claims)
      .where(and(eq(claims.id, params.claimId), eq(claims.tenantId, params.tenantId)))
      .for('update');
    if (
      claim?.userId !== params.expectedClaimOwnerId ||
      params.userId !== params.expectedClaimOwnerId
    ) {
      throw new ClaimDocumentUploadConflictError();
    }
  }
  // db-access-guard: tenant-scoped -- reason: document metadata copies tenant, claim, and uploader scope from the validated upload session.
  const [created] = await tx
    .insert(claimDocuments)
    .values(documentValues(params))
    .onConflictDoNothing({ target: claimDocuments.id })
    .returning({ id: claimDocuments.id });
  if (created) return true;

  // Each signed intent mints its own id, so an existing row is either this exact upload already
  // committed behind a lost response (settled as not created) or a conflict that is never overwritten.
  if (await existingDocumentMatches(tx, params)) return false;
  throw new ClaimDocumentUploadConflictError();
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
    .values(documentValues(params))
    .onConflictDoNothing({ target: claimDocuments.id })
    .returning({ id: claimDocuments.id });

  if (!created) {
    const documentMatches = await existingDocumentMatches(tx, params);
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
    if (documentMatches && existingLink?.requestId === params.informationRequestId) {
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
    const created = params.informationRequestId
      ? await insertRequestLinkedDocument(tx, {
          ...params,
          informationRequestId: params.informationRequestId,
        })
      : await insertOrdinaryDocument(tx, params);
    // An exact replay of an already committed upload adds no consent row; callers skip AI queueing
    // for false. The committed consent is retained; a replay does not repair a missed AI queue step.
    if (!created) return false;

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

  // Resolve the trusted role before any transaction opens so a missing or mismatched role fails
  // without partial writes. Ordinary and request-linked writes share one tenant-bound transaction
  // with the optional consent row, so either both persist or neither does.
  const role = resolveMetadataTransactionRole(params);
  // db-access-guard: tenant-scoped -- reason: metadata and consent writes run under the validated tenant context and trusted actor role.
  return withTenantContext({ tenantId: params.tenantId, role }, persist);
}
