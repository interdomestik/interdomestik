import type { ExtractionPipelineError } from '@/lib/ai/extraction-pipeline';
import { withTenantContext } from '@interdomestik/database';
import { aiRuns } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

import type { ClaimedClaimAiRun } from './claim-pipeline-run';

export async function markClaimAiRunFailed(args: { run: ClaimedClaimAiRun; error: unknown }) {
  const pipelineError = args.error as Partial<ExtractionPipelineError>;
  const errorCode =
    typeof pipelineError.errorCode === 'string'
      ? pipelineError.errorCode
      : 'claim_ai_processing_failed';
  const message = args.error instanceof Error ? args.error.message : 'Claim AI workflow failed.';

  const [persistedFailure] = await withTenantContext(
    { tenantId: args.run.tenantId, role: 'system' },
    async tx =>
      tx
        .update(aiRuns)
        .set({
          status: 'failed',
          completedAt: new Date(),
          errorCode,
          errorMessage: message,
        })
        .where(and(eq(aiRuns.id, args.run.runId), eq(aiRuns.status, 'processing')))
        .returning({ id: aiRuns.id, errorCode: aiRuns.errorCode })
  );

  if (!persistedFailure?.errorCode) {
    throw new Error(`Claim AI failure for run ${args.run.runId} was not persisted.`);
  }

  return { errorCode: persistedFailure.errorCode };
}
