import { ExtractionPipelineError, type ExtractionCritique } from '@/lib/ai/extraction-pipeline';
import { withTenantContext } from '@interdomestik/database';
import { aiRuns, documentExtractions, documents } from '@interdomestik/database/schema';
import {
  CLAIM_INTAKE_EXTRACT_SCHEMA_VERSION,
  LEGAL_DOC_EXTRACT_SCHEMA_VERSION,
} from '@interdomestik/domain-ai';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { ClaimedClaimAiRun, ClaimAiWorkflow } from './claim-pipeline-run';

const DELETED_DOCUMENT_ERROR_CODE = 'claim_ai_document_deleted';
const DELETED_DOCUMENT_ERROR_MESSAGE =
  'Claim AI run skipped because the source document was deleted.';

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

function throwDeletedDocumentError(): never {
  throw new ExtractionPipelineError(DELETED_DOCUMENT_ERROR_CODE, DELETED_DOCUMENT_ERROR_MESSAGE);
}

export async function persistClaimAiExtraction(args: {
  run: ClaimedClaimAiRun;
  extraction: Record<string, unknown>;
  critique: ExtractionCritique;
}) {
  const completedAt = new Date();

  await withTenantContext({ tenantId: args.run.tenantId, role: 'system' }, async tx => {
    const [activeDocument] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, args.run.documentId),
          eq(documents.tenantId, args.run.tenantId),
          isNull(documents.deletedAt)
        )
      );

    if (!activeDocument) {
      await tx
        .update(aiRuns)
        .set({
          status: 'failed',
          completedAt,
          errorCode: DELETED_DOCUMENT_ERROR_CODE,
          errorMessage: DELETED_DOCUMENT_ERROR_MESSAGE,
          requestJson: {},
          outputJson: null,
          responseJson: null,
        })
        .where(eq(aiRuns.id, args.run.runId));
      throwDeletedDocumentError();
    }

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

    const [completedRun] = await tx
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
      .where(and(eq(aiRuns.id, args.run.runId), eq(aiRuns.status, 'processing')))
      .returning({ id: aiRuns.id });

    if (!completedRun) {
      await tx
        .delete(documentExtractions)
        .where(
          and(
            eq(documentExtractions.sourceRunId, args.run.runId),
            eq(documentExtractions.tenantId, args.run.tenantId)
          )
        );
      await tx
        .update(aiRuns)
        .set({
          status: 'failed',
          completedAt,
          errorCode: DELETED_DOCUMENT_ERROR_CODE,
          errorMessage: DELETED_DOCUMENT_ERROR_MESSAGE,
          requestJson: {},
          outputJson: null,
          responseJson: null,
        })
        .where(eq(aiRuns.id, args.run.runId));
      throwDeletedDocumentError();
    }
  });
}
