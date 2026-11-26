import {
  and,
  claimDocumentAiExtractionConsents,
  claimDocuments,
  eq,
  isNull,
  type TenantTransaction,
} from '@interdomestik/database';
import { randomUUID } from 'node:crypto';

type EvidenceScope = Readonly<{ tenantId: string; claimId: string; actorId: string }>;

export type VerifiedEvidenceUpload = Readonly<{
  fileId: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  bucket: string;
  category: 'evidence' | 'legal';
}>;

export type EvidenceUploadConsent = Readonly<{
  granted: boolean;
  locale: string;
  privacyVersion: string;
  sourceSurface: string;
}>;

function documentWhere({ tenantId, claimId, actorId }: EvidenceScope, fileId: string) {
  return and(
    eq(claimDocuments.tenantId, tenantId),
    eq(claimDocuments.claimId, claimId),
    eq(claimDocuments.uploadedBy, actorId),
    eq(claimDocuments.id, fileId)
  );
}

export async function hasClaimEvidenceDocument(
  tx: TenantTransaction,
  scope: EvidenceScope,
  fileId: string
): Promise<boolean> {
  const [row] = await tx
    .select({ id: claimDocuments.id })
    .from(claimDocuments)
    .where(documentWhere(scope, fileId))
    .limit(1);
  return Boolean(row);
}

async function matchesOriginalConsent(
  tx: TenantTransaction,
  { tenantId, claimId, actorId }: EvidenceScope,
  fileId: string,
  consent?: EvidenceUploadConsent
): Promise<boolean> {
  // A later withdrawal is a separate event. Replay compares the consent captured at upload.
  const recorded = await tx
    .select()
    .from(claimDocumentAiExtractionConsents)
    .where(
      and(
        eq(claimDocumentAiExtractionConsents.tenantId, tenantId),
        eq(claimDocumentAiExtractionConsents.subjectId, actorId),
        eq(claimDocumentAiExtractionConsents.claimId, claimId),
        eq(claimDocumentAiExtractionConsents.documentId, fileId),
        eq(claimDocumentAiExtractionConsents.consentType, 'ai_document_extraction'),
        eq(claimDocumentAiExtractionConsents.processingPurpose, 'ai_document_extraction'),
        eq(claimDocumentAiExtractionConsents.status, 'accepted'),
        isNull(claimDocumentAiExtractionConsents.supersedesConsentId)
      )
    )
    .limit(2);

  if (!consent?.granted) return recorded.length === 0;
  const [original] = recorded;
  return (
    recorded.length === 1 &&
    original.actorId === actorId &&
    original.locale === consent.locale &&
    original.privacyVersion === consent.privacyVersion &&
    original.sourceSurface === consent.sourceSurface
  );
}

export async function confirmClaimEvidence(
  tx: TenantTransaction,
  {
    verifiedScope,
    verifiedUpload,
    consent,
    replayOnly = false,
  }: {
    verifiedScope: EvidenceScope;
    verifiedUpload: VerifiedEvidenceUpload;
    consent?: EvidenceUploadConsent;
    replayOnly?: boolean;
  }
): Promise<'created' | 'replayed' | 'conflict'> {
  const { tenantId, claimId, actorId } = verifiedScope;
  const { fileId, originalName, storagePath, mimeType, fileSize, bucket, category } =
    verifiedUpload;

  if (!replayOnly) {
    // db-access-guard: tenant-scoped -- reason: tenant, claim and uploader are from the locked scope.
    const [created] = await tx
      .insert(claimDocuments)
      .values({
        id: fileId,
        name: originalName,
        filePath: storagePath,
        fileType: mimeType,
        fileSize,
        bucket,
        category,
        tenantId,
        claimId,
        uploadedBy: actorId,
      })
      .onConflictDoNothing({ target: claimDocuments.id })
      .returning({ id: claimDocuments.id });

    if (created) {
      if (consent?.granted) {
        const now = new Date();
        // db-access-guard: tenant-scoped -- reason: the consent copies the locked claim and actor scope.
        await tx.insert(claimDocumentAiExtractionConsents).values({
          id: randomUUID(),
          documentId: fileId,
          consentType: 'ai_document_extraction',
          processingPurpose: 'ai_document_extraction',
          status: 'accepted',
          privacyVersion: consent.privacyVersion,
          locale: consent.locale,
          sourceSurface: consent.sourceSurface,
          recordedAt: now,
          grantedAt: now,
          tenantId,
          claimId,
          subjectId: actorId,
          actorId,
        });
      }
      return 'created';
    }
  }

  const [row] = await tx
    .select()
    .from(claimDocuments)
    .where(documentWhere(verifiedScope, fileId))
    .limit(1);
  if (
    !row ||
    row.name !== originalName ||
    row.filePath !== storagePath ||
    row.fileType !== mimeType ||
    row.fileSize !== fileSize ||
    row.bucket !== bucket ||
    row.category !== category ||
    !(await matchesOriginalConsent(tx, verifiedScope, fileId, consent))
  ) {
    return 'conflict';
  }
  return 'replayed';
}
