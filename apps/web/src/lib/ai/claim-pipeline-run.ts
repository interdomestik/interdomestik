import { db } from '@/lib/db.server';
import { withTenantContext } from '@interdomestik/database';
import { aiRuns, claims, documents } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

export type ClaimAiWorkflow = 'claim_intake_extract' | 'legal_doc_extract';

export type ClaimedClaimAiRun = {
  runId: string;
  tenantId: string;
  workflow: ClaimAiWorkflow;
  documentId: string;
  claimId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  uploadedAt: Date;
  requestJson: Record<string, unknown> | null;
  claimTitle: string;
  claimDescription: string | null;
  claimCategory: string | null;
  claimAmount: string | null;
  claimCurrency: string | null;
};

function isClaimAiWorkflow(workflow: unknown): workflow is ClaimAiWorkflow {
  return workflow === 'claim_intake_extract' || workflow === 'legal_doc_extract';
}

export async function claimClaimAiRun(
  runId: string
): Promise<
  | { status: 'claimed'; run: ClaimedClaimAiRun }
  | { status: 'skipped'; claimId: string; workflow: ClaimAiWorkflow }
> {
  const [queuedRun] = await db
    .select({
      runId: aiRuns.id,
      tenantId: aiRuns.tenantId,
      workflow: aiRuns.workflow,
      documentId: aiRuns.documentId,
      claimId: aiRuns.entityId,
      storagePath: documents.storagePath,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
      uploadedAt: documents.uploadedAt,
      status: aiRuns.status,
      requestJson: aiRuns.requestJson,
      claimTitle: claims.title,
      claimDescription: claims.description,
      claimCategory: claims.category,
      claimAmount: claims.claimAmount,
      claimCurrency: claims.currency,
    })
    .from(aiRuns)
    .innerJoin(
      documents,
      and(eq(documents.id, aiRuns.documentId), eq(documents.tenantId, aiRuns.tenantId))
    )
    .innerJoin(claims, and(eq(claims.id, aiRuns.entityId), eq(claims.tenantId, aiRuns.tenantId)))
    .where(and(eq(aiRuns.id, runId), eq(aiRuns.entityType, 'claim')));

  if (!queuedRun?.documentId || !queuedRun.claimId || !isClaimAiWorkflow(queuedRun.workflow)) {
    throw new Error(`Queued claim AI run ${runId} was not found.`);
  }

  if (queuedRun.status !== 'queued') {
    return { status: 'skipped', claimId: queuedRun.claimId, workflow: queuedRun.workflow };
  }

  const [claimedRun] = await withTenantContext(
    { tenantId: queuedRun.tenantId, role: 'system' },
    async tx =>
      tx
        .update(aiRuns)
        .set({ status: 'processing', startedAt: new Date(), errorCode: null, errorMessage: null })
        .where(and(eq(aiRuns.id, runId), eq(aiRuns.status, 'queued')))
        .returning({ id: aiRuns.id })
  );

  if (!claimedRun) {
    return { status: 'skipped', claimId: queuedRun.claimId, workflow: queuedRun.workflow };
  }

  return {
    status: 'claimed',
    run: {
      runId,
      tenantId: queuedRun.tenantId,
      workflow: queuedRun.workflow,
      documentId: queuedRun.documentId,
      claimId: queuedRun.claimId,
      storagePath: queuedRun.storagePath,
      fileName: queuedRun.fileName,
      mimeType: queuedRun.mimeType,
      uploadedAt: queuedRun.uploadedAt,
      requestJson: queuedRun.requestJson,
      claimTitle: queuedRun.claimTitle,
      claimDescription: queuedRun.claimDescription,
      claimCategory: queuedRun.claimCategory,
      claimAmount: queuedRun.claimAmount,
      claimCurrency: queuedRun.claimCurrency,
    },
  };
}
