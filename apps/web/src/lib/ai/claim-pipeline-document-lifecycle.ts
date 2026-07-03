import { db } from '@/lib/db.server';
import { withTenantContext } from '@interdomestik/database';
import { aiRuns, documents } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

import type { ClaimAiWorkflow } from './claim-pipeline-run';

type SkippedRun = { status: 'skipped'; claimId: string; workflow: ClaimAiWorkflow };

export async function failDeletedDocumentClaimAiRun(
  runId: string,
  isWorkflow: (workflow: unknown) => workflow is ClaimAiWorkflow
): Promise<SkippedRun | null> {
  const [run] = await db
    .select({
      tenantId: aiRuns.tenantId,
      workflow: aiRuns.workflow,
      claimId: aiRuns.entityId,
      status: aiRuns.status,
      errorCode: aiRuns.errorCode,
      deletedAt: documents.deletedAt,
    })
    .from(aiRuns)
    .innerJoin(
      documents,
      and(eq(documents.id, aiRuns.documentId), eq(documents.tenantId, aiRuns.tenantId))
    )
    .where(and(eq(aiRuns.id, runId), eq(aiRuns.entityType, 'claim')));

  if (!run?.deletedAt || !run.claimId || !isWorkflow(run.workflow)) {
    return null;
  }

  if (run.status === 'failed' && run.errorCode === 'claim_ai_document_deleted') {
    return { status: 'skipped', claimId: run.claimId, workflow: run.workflow };
  }

  if (run.status !== 'queued') return null;

  const [failedRun] = await withTenantContext(
    { tenantId: run.tenantId, role: 'system' },
    async tx =>
      tx
        .update(aiRuns)
        .set({
          status: 'failed',
          completedAt: new Date(),
          errorCode: 'claim_ai_document_deleted',
          errorMessage: 'Claim AI run skipped because the source document was deleted.',
          requestJson: {},
          outputJson: null,
          responseJson: null,
        })
        .where(and(eq(aiRuns.id, runId), eq(aiRuns.status, 'queued')))
        .returning({ id: aiRuns.id })
  );

  if (!failedRun) return null;

  return { status: 'skipped', claimId: run.claimId, workflow: run.workflow };
}
