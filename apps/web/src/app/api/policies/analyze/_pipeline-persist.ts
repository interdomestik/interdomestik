import type { ExtractionCritique, ExtractionPipelineError } from '@/lib/ai/extraction-pipeline';
import { withTenantContext } from '@interdomestik/database';
import { aiRuns, documentExtractions, policies } from '@interdomestik/database/schema';
import { getResponsesWorkflowConfig } from '@interdomestik/domain-ai/models';
import type { PolicyExtract } from '@interdomestik/domain-ai/schemas/policy-extract';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { ClaimedPolicyRun } from './_pipeline-input';

const POLICY_EXTRACT_WORKFLOW = 'policy_extract' as const;
const POLICY_EXTRACT_CONFIG = getResponsesWorkflowConfig(POLICY_EXTRACT_WORKFLOW);

export async function persistPolicyExtraction(args: {
  run: ClaimedPolicyRun;
  extraction: PolicyExtract;
  critique: ExtractionCritique;
}) {
  const completedAt = new Date();

  await withTenantContext({ tenantId: args.run.tenantId, role: 'system' }, async tx => {
    await tx
      .update(policies)
      .set({
        provider: args.extraction.provider ?? null,
        policyNumber: args.extraction.policyNumber ?? null,
        analysisJson: args.extraction,
      })
      .where(eq(policies.id, args.run.policyId));

    await tx
      .insert(documentExtractions)
      .values({
        id: nanoid(),
        tenantId: args.run.tenantId,
        documentId: args.run.documentId,
        entityType: 'policy',
        entityId: args.run.policyId,
        workflow: POLICY_EXTRACT_WORKFLOW,
        schemaVersion: POLICY_EXTRACT_CONFIG.promptVersion,
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
          event: 'policy/extract.requested',
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

export async function markPolicyExtractionRunFailed(args: {
  run: ClaimedPolicyRun;
  error: unknown;
}) {
  const pipelineError = args.error as Partial<ExtractionPipelineError>;
  const errorCode =
    typeof pipelineError.errorCode === 'string' ? pipelineError.errorCode : 'policy_extract_failed';
  const message = args.error instanceof Error ? args.error.message : 'Policy extraction failed.';

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
