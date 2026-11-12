import {
  and,
  claimDocuments,
  claimInformationRequestEvidence,
  eq,
  type TenantTransaction,
} from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import type { PersistClaimDocumentParams } from './claim-document-write';
import { assertEvidenceTenantAuthority } from './persisted-evidence';

type ReplayParams = Pick<
  PersistClaimDocumentParams,
  | 'authority'
  | 'tenantId'
  | 'claimId'
  | 'fileId'
  | 'fileSize'
  | 'mimeType'
  | 'originalName'
  | 'resolvedBucket'
  | 'storagePath'
  | 'category'
  | 'userId'
  | 'informationRequestId'
>;

function matchesExistingDocument(
  row: typeof claimDocuments.$inferSelect,
  params: ReplayParams
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
export async function existingDocumentMatches(
  tx: TenantTransaction,
  params: ReplayParams
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

export async function isPersistedClaimDocumentReplay(params: ReplayParams): Promise<boolean> {
  assertEvidenceTenantAuthority(params);
  return await withTenantAuthority(params.authority, async tx => {
    if (!(await existingDocumentMatches(tx, params))) return false;
    if (!params.informationRequestId) return true;
    const [link] = await tx
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
    return link?.requestId === params.informationRequestId;
  });
}
