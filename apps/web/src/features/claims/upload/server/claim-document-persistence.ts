import {
  emitClaimAiRunRequestedService,
  markClaimAiRunDispatchFailedService,
} from '@/lib/ai/claim-workflows';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { queueClaimDocumentAiWorkflows } from '@interdomestik/domain-claims/claims/ai-workflows';

import {
  persistClaimDocumentMetadata,
  type PersistClaimDocumentParams,
} from './claim-document-write';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
export { InformationRequestUploadConflictError, type UploadCategory } from './claim-document-write';

/** The document write params plus the session tenant authority the AI queue runs under. */
export type PersistClaimDocumentWithAuthorityParams = PersistClaimDocumentParams & {
  authority: TenantAuthority;
};

async function queueAiWorkflows(params: PersistClaimDocumentWithAuthorityParams) {
  // db-access-guard: tenant-scoped -- reason: queue resolver filters exact tenant/user/claim/document scope
  return withTenantAuthority(params.authority, async tx =>
    queueClaimDocumentAiWorkflows(tx, {
      claimId: params.claimId,
      tenantId: params.tenantId,
      userId: params.userId,
      files: [
        {
          documentId: params.fileId,
          name: params.originalName,
          path: params.storagePath,
          type: params.mimeType,
          size: params.fileSize,
          bucket: params.resolvedBucket,
          category: params.category,
        },
      ],
    })
  );
}

export async function persistClaimDocumentAndQueueWorkflows(
  params: PersistClaimDocumentWithAuthorityParams
): Promise<void> {
  const created = await persistClaimDocumentMetadata(params);

  if (!created) return;

  try {
    const queuedRuns = await queueAiWorkflows(params);
    for (const queuedRun of queuedRuns) {
      try {
        await emitClaimAiRunRequestedService(queuedRun);
      } catch (error) {
        await markClaimAiRunDispatchFailedService({
          authority: params.authority,
          runId: queuedRun.runId,
          message: error instanceof Error ? error.message : 'Failed to dispatch claim AI run.',
        });
      }
    }
  } catch (queueError) {
    console.error(`${params.logPrefix} AI queue failed after metadata persisted`, {
      claimId: params.claimId,
      fileId: params.fileId,
      message: queueError instanceof Error ? queueError.message : String(queueError),
    });
  }
}
