import { db, eq } from '@interdomestik/database';
import { aiRuns, documentExtractions } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';

export type AiRunWorkflowState = 'queued' | 'processing' | 'completed' | 'needs_review' | 'failed';

export interface AiRunReadModel {
  id: string;
  workflow: string;
  status: string;
  workflowState: AiRunWorkflowState;
  documentId: string | null;
  entityType: string | null;
  entityId: string | null;
  requestedBy: string | null;
  reviewStatus: string;
  errorCode: string | null;
  errorMessage: string | null;
  warnings: string[];
  extraction: Record<string, unknown> | null;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

function normalizeDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function deriveWorkflowState(status: string, reviewStatus: string): AiRunWorkflowState {
  if (status === 'failed') return 'failed';
  if (status === 'processing') return 'processing';
  if (status === 'completed' && reviewStatus === 'pending') return 'needs_review';
  if (status === 'completed') return 'completed';
  return 'queued';
}

export async function getAiRun(params: {
  tenantId: string;
  runId: string;
}): Promise<AiRunReadModel | null> {
  const [row] = await db
    .select({
      id: aiRuns.id,
      workflow: aiRuns.workflow,
      status: aiRuns.status,
      documentId: aiRuns.documentId,
      entityType: aiRuns.entityType,
      entityId: aiRuns.entityId,
      requestedBy: aiRuns.requestedBy,
      runReviewStatus: aiRuns.reviewStatus,
      extractionReviewStatus: documentExtractions.reviewStatus,
      errorCode: aiRuns.errorCode,
      errorMessage: aiRuns.errorMessage,
      warnings: documentExtractions.warnings,
      extraction: documentExtractions.extractedJson,
      createdAt: aiRuns.createdAt,
      startedAt: aiRuns.startedAt,
      completedAt: aiRuns.completedAt,
    })
    .from(aiRuns)
    .leftJoin(documentExtractions, eq(documentExtractions.sourceRunId, aiRuns.id))
    .where(withTenant(params.tenantId, aiRuns.tenantId, eq(aiRuns.id, params.runId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const reviewStatus =
    typeof row.extractionReviewStatus === 'string' && row.extractionReviewStatus.length > 0
      ? row.extractionReviewStatus
      : row.runReviewStatus;

  return {
    id: row.id,
    workflow: row.workflow,
    status: row.status,
    workflowState: deriveWorkflowState(row.status, reviewStatus),
    documentId: row.documentId ?? null,
    entityType: row.entityType ?? null,
    entityId: row.entityId ?? null,
    requestedBy: row.requestedBy ?? null,
    reviewStatus,
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
    extraction:
      row.extraction && typeof row.extraction === 'object'
        ? (row.extraction as Record<string, unknown>)
        : null,
    createdAt: normalizeDate(row.createdAt),
    startedAt: normalizeDate(row.startedAt),
    completedAt: normalizeDate(row.completedAt),
  };
}
