import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import {
  isMemberUploadRole,
  linkInformationRequestEvidence,
  lockClaimForEvidence,
  matchesInformationRequestEvidence,
} from '@interdomestik/domain-claims/claims/evidence-confirmation';
import {
  confirmClaimEvidence,
  type EvidenceUploadConsent,
  type VerifiedEvidenceUpload,
} from '@interdomestik/domain-documents/claim-evidence';
import { ClaimDocumentUploadConflictError } from './claim-document-upload-conflict';

export { ClaimDocumentUploadConflictError } from './claim-document-upload-conflict';

export type UploadCategory = VerifiedEvidenceUpload['category'];

export type PersistClaimDocumentParams = Omit<VerifiedEvidenceUpload, 'bucket'> & {
  actorRole?: string;
  aiExtractionConsent?: EvidenceUploadConsent;
  authority: TenantAuthority;
  expectedClaimOwnerId?: string;
  claimId: string;
  logPrefix: string;
  resolvedBucket: string;
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

export class ClaimDocumentTenantAuthorityError extends Error {
  constructor() {
    super('The claim document write does not belong to the tenant of the supplied authority.');
    this.name = 'ClaimDocumentTenantAuthorityError';
  }
}

export async function persistClaimDocumentMetadata(
  params: PersistClaimDocumentParams,
  replayOnly = false
): Promise<boolean> {
  const { authority, claimId, fileId, informationRequestId } = params;
  const { tenantId, principal } = readTenantAuthority(authority);
  if (tenantId !== params.tenantId) throw new ClaimDocumentTenantAuthorityError();
  const role = principal?.role;
  const memberSurface = isMemberUploadRole(role);
  const expectedRole = memberSurface ? 'member' : role;
  if (
    !principal ||
    !role ||
    principal.userId !== params.userId ||
    (informationRequestId === undefined
      ? params.actorRole !== expectedRole
      : !memberSurface || (params.actorRole !== undefined && params.actorRole !== 'member'))
  ) {
    throw new ClaimDocumentActorRoleError();
  }
  if (
    params.expectedClaimOwnerId !== undefined &&
    params.expectedClaimOwnerId !== principal.userId
  ) {
    throw new ClaimDocumentUploadConflictError();
  }

  return withTenantAuthority(authority, async tx => {
    const verifiedScope = await lockClaimForEvidence(tx, {
      authority,
      claimId,
      surface: memberSurface ? 'member' : 'admin',
      informationRequestId,
    });
    if (!verifiedScope) {
      throw informationRequestId === undefined
        ? new ClaimDocumentUploadConflictError()
        : new InformationRequestUploadConflictError();
    }

    const outcome = await confirmClaimEvidence(tx, {
      verifiedScope,
      verifiedUpload: {
        fileId,
        originalName: params.originalName,
        storagePath: params.storagePath,
        mimeType: params.mimeType,
        fileSize: params.fileSize,
        bucket: params.resolvedBucket,
        category: params.category,
      },
      consent: memberSurface ? params.aiExtractionConsent : undefined,
      replayOnly,
    });

    if (outcome === 'created') {
      await linkInformationRequestEvidence(tx, verifiedScope, fileId);
      return true;
    }
    if (
      outcome === 'replayed' &&
      (await matchesInformationRequestEvidence(tx, verifiedScope, fileId))
    ) {
      return false;
    }
    throw new ClaimDocumentUploadConflictError();
  });
}
