import { ExtractionPipelineError } from '@/lib/ai/extraction-pipeline';
import { db } from '@/lib/db.server';
import { aiRuns, documents } from '@interdomestik/database/schema';
import { and, eq, isNull } from 'drizzle-orm';

export type DeletedDocumentFailure = {
  errorCode: string;
  errorMessage: string;
};

type ProcessingRunDocument = {
  runId: string;
  tenantId: string;
  documentId: string;
};

export function buildDeletedDocumentFailure(completedAt: Date, failure: DeletedDocumentFailure) {
  return {
    status: 'failed' as const,
    completedAt,
    errorCode: failure.errorCode,
    errorMessage: failure.errorMessage,
    requestJson: {},
    outputJson: null,
    responseJson: null,
  };
}

export function throwDeletedDocumentError(failure: DeletedDocumentFailure): never {
  throw new ExtractionPipelineError(failure.errorCode, failure.errorMessage);
}

export async function assertProcessingRunHasActiveDocument(
  run: ProcessingRunDocument,
  failure: DeletedDocumentFailure
) {
  // db-access-guard: tenant-scoped -- reason: pre-download liveness check is constrained by exact runId, tenantId, and documentId before AI document processing
  const [activeRun] = await db
    .select({ id: aiRuns.id })
    .from(aiRuns)
    .innerJoin(
      documents,
      and(eq(documents.id, aiRuns.documentId), eq(documents.tenantId, aiRuns.tenantId))
    )
    .where(
      and(
        eq(aiRuns.id, run.runId),
        eq(aiRuns.status, 'processing'),
        eq(documents.id, run.documentId),
        eq(documents.tenantId, run.tenantId),
        isNull(documents.deletedAt)
      )
    );

  if (!activeRun) throwDeletedDocumentError(failure);
}
