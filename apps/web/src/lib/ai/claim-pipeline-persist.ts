import type { ExtractionCritique } from '@/lib/ai/extraction-pipeline';
import { sql, type TenantTransaction, withTenantContext } from '@interdomestik/database';
import { aiRuns, documentExtractions } from '@interdomestik/database/schema';
import {
  CLAIM_INTAKE_EXTRACT_SCHEMA_VERSION,
  LEGAL_DOC_EXTRACT_SCHEMA_VERSION,
} from '@interdomestik/domain-ai';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import {
  buildDeletedClaimRunFailure,
  throwDeletedClaimDocumentError,
} from './claim-pipeline-document-lifecycle';
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

async function lockActiveDocument(
  tx: TenantTransaction,
  args: { documentId: string; tenantId: string }
) {
  // db-access-guard: tenant-scoped -- reason: row lock is constrained by exact tenantId and documentId before claim AI extraction persistence
  return tx.execute<{ id: string }>(sql`
    select "id"
    from "documents"
    where "id" = ${args.documentId}
      and "tenant_id" = ${args.tenantId}
      and "deleted_at" is null
    for update
  `);
}

export async function persistClaimAiExtraction(args: {
  run: ClaimedClaimAiRun;
  extraction: Record<string, unknown>;
  critique: ExtractionCritique;
}) {
  const completedAt = new Date();

  await withTenantContext({ tenantId: args.run.tenantId, role: 'system' }, async tx => {
    const [activeDocument] = await lockActiveDocument(tx, {
      documentId: args.run.documentId,
      tenantId: args.run.tenantId,
    });

    if (!activeDocument) {
      await tx
        .update(aiRuns)
        .set(buildDeletedClaimRunFailure(completedAt))
        .where(eq(aiRuns.id, args.run.runId));
      throwDeletedClaimDocumentError();
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
        .set(buildDeletedClaimRunFailure(completedAt))
        .where(eq(aiRuns.id, args.run.runId));
      throwDeletedClaimDocumentError();
    }
  });
}
