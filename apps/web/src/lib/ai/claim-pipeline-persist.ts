import type { ExtractionCritique, ExtractionPipelineError } from '@/lib/ai/extraction-pipeline';
import { withTenantContext } from '@interdomestik/database';
import { aiRuns, documentExtractions } from '@interdomestik/database/schema';
import {
  CLAIM_INTAKE_EXTRACT_SCHEMA_VERSION,
  LEGAL_DOC_EXTRACT_SCHEMA_VERSION,
} from '@interdomestik/domain-ai';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { ClaimedClaimAiRun, ClaimAiWorkflow } from './claim-pipeline-run';

function getEventName(workflow: ClaimAiWorkflow) {
  return workflow === 'legal_doc_extract'
    ? 'legal/extract.requested'
    : 'claim/intake-extract.requested';
}

function getSchemaVersion(workflow: ClaimAiWorkflow) {
  return workflow === 'legal_doc_extract'
    ? LEGAL_DOC_EXTRACT_SCHEMA_VERSION
    : CLAIM_INTAKE_EXTRACT_SCHEMA_VERSION;
}

export async function persistClaimAiExtraction(args: {
  run: ClaimedClaimAiRun;
  extraction: Record<string, unknown>;
  critique: ExtractionCritique;
}) {
  const completedAt = new Date();

  await withTenantContext({ tenantId: args.run.tenantId, role: 'system' }, async tx => {
    await tx
      .insert(documentExtractions)
      .values({
        id: nanoid(),
        tenantId: args.run.tenantId,
        documentId: args.run.documentId,
        entityType: 'claim',
        entityId: args.run.claimId,
        workflow: args.run.workflow,
        schemaVersion: getSchemaVersion(args.run.workflow),
        extractedJson: args.extraction,
        confidence: String(args.critique.confidence),
        warnings: args.critique.warnings,
        sourceRunId: args.run.runId,
        reviewStatus: 'pending',
        createdAt: completedAt,
        updatedAt: completedAt,
      })
      .onConflictDoNothing({ target: documentExtractions.sourceRunId });

    await tx
      .update(aiRuns)
      .set({
        status: 'completed',
        responseJson: {
          event: getEventName(args.run.workflow),
          runId: args.run.runId,
          critique: {
            decision: args.critique.decision,
            warningCodes: args.critique.warningCodes,
            escalationRecommended: args.critique.escalationRecommended,
          },
        },
        outputJson: args.extraction,
        reviewStatus: 'pending',
        completedAt,
        errorCode: null,
        errorMessage: null,
      })
      .where(eq(aiRuns.id, args.run.runId));
  });
}

export async function markClaimAiRunFailed(args: { run: ClaimedClaimAiRun; error: unknown }) {
  const pipelineError = args.error as Partial<ExtractionPipelineError>;
  const errorCode =
    typeof pipelineError.errorCode === 'string'
      ? pipelineError.errorCode
      : 'claim_ai_processing_failed';
  const message = args.error instanceof Error ? args.error.message : 'Claim AI workflow failed.';

  await withTenantContext({ tenantId: args.run.tenantId, role: 'system' }, async tx => {
    await tx
      .update(aiRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorCode,
        errorMessage: message,
      })
      .where(eq(aiRuns.id, args.run.runId));
  });
}
