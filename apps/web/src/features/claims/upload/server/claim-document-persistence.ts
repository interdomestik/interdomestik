import {
  emitClaimAiRunRequestedService,
  markClaimAiRunDispatchFailedService,
} from '@/lib/ai/claim-workflows';
import { claimDocumentAiExtractionConsents, claimDocuments, db } from '@interdomestik/database';
import { queueClaimDocumentAiWorkflows } from '@interdomestik/domain-claims/claims/ai-workflows';
import { randomUUID } from 'node:crypto';

export type UploadCategory = 'evidence' | 'legal';

type AiExtractionConsentCapture = {
  granted: boolean;
  locale: string;
  privacyVersion: string;
  sourceSurface: string;
};

type PersistClaimDocumentParams = {
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
};

async function insertClaimDocument(params: PersistClaimDocumentParams): Promise<void> {
  // db-access-guard: tenant-scoped -- reason: transaction writes only document metadata and optional consent rows scoped by validated tenant, user, claim, and document ids.
  await db.transaction(async tx => {
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
  });
}

async function queueAiWorkflows(params: PersistClaimDocumentParams) {
  // db-access-guard: tenant-scoped -- reason: queue resolver filters exact tenant/user/claim/document scope
  return db.transaction(async tx =>
    queueClaimDocumentAiWorkflows({
      tx,
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
  params: PersistClaimDocumentParams
): Promise<void> {
  await insertClaimDocument(params);

  try {
    const queuedRuns = await queueAiWorkflows(params);
    for (const queuedRun of queuedRuns) {
      try {
        await emitClaimAiRunRequestedService(queuedRun);
      } catch (error) {
        await markClaimAiRunDispatchFailedService({
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
