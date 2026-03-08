import { db } from '@/lib/db.server';
import { and, eq } from '@interdomestik/database';
import { aiRuns, documentExtractions, policies } from '@interdomestik/database/schema';
import {
  claimIntakeExtractSchema,
  legalDocExtractSchema,
  policyExtractSchema,
} from '@interdomestik/domain-ai';

type ReviewAction = 'approve' | 'reject' | 'correct';

type SubmitAiReviewResult =
  | { kind: 'ok'; data: { id: string; reviewStatus: string } }
  | { kind: 'notFound' }
  | { kind: 'unprocessable'; message: string };

type CorrectedReviewPayloadResult =
  | { kind: 'ok'; correctedExtraction?: Record<string, unknown>; correctedWarnings?: string[] }
  | { kind: 'unprocessable'; message: string };

type ReviewTx = {
  update: typeof db.update;
};

function getReviewStatus(action: ReviewAction): 'approved' | 'rejected' | 'corrected' {
  if (action === 'approve') return 'approved';
  if (action === 'reject') return 'rejected';
  return 'corrected';
}

function getReviewParser(workflow: string) {
  switch (workflow) {
    case 'policy_extract':
      return policyExtractSchema;
    case 'claim_intake_extract':
      return claimIntakeExtractSchema;
    case 'legal_doc_extract':
      return legalDocExtractSchema;
    default:
      return null;
  }
}

function getWarningStrings(value: Record<string, unknown>): string[] {
  return Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is string => typeof warning === 'string')
    : [];
}

function resolveCorrectedReviewPayload(args: {
  action: ReviewAction;
  workflow: string;
  correctedExtraction?: Record<string, unknown>;
}): CorrectedReviewPayloadResult {
  if (args.action !== 'correct') {
    return { kind: 'ok' };
  }

  if (!args.correctedExtraction || typeof args.correctedExtraction !== 'object') {
    return { kind: 'unprocessable', message: 'Corrected extraction is required.' };
  }

  const parser = getReviewParser(args.workflow);
  if (!parser) {
    return {
      kind: 'ok',
      correctedExtraction: args.correctedExtraction,
      correctedWarnings: getWarningStrings(args.correctedExtraction),
    };
  }

  const parsed = parser.safeParse(args.correctedExtraction);
  if (!parsed.success) {
    return { kind: 'unprocessable', message: 'Invalid corrected extraction payload.' };
  }

  return {
    kind: 'ok',
    correctedExtraction: parsed.data,
    correctedWarnings: parsed.data.warnings,
  };
}

function buildExtractionReviewUpdate(args: {
  nextReviewStatus: 'approved' | 'rejected' | 'corrected';
  reviewerId: string;
  correctedExtraction?: Record<string, unknown>;
  correctedWarnings?: string[];
}): Record<string, unknown> {
  const extractionUpdate: Record<string, unknown> = {
    reviewStatus: args.nextReviewStatus,
    reviewedBy: args.reviewerId,
  };

  if (args.correctedExtraction) {
    extractionUpdate.extractedJson = args.correctedExtraction;
    extractionUpdate.warnings = args.correctedWarnings ?? [];
    extractionUpdate.updatedAt = new Date();
  }

  return extractionUpdate;
}

async function syncReviewedPolicyExtraction(args: {
  tx: ReviewTx;
  correctedExtraction?: Record<string, unknown>;
  entityType: string | null;
  entityId: string | null;
  tenantId: string;
}) {
  if (!args.correctedExtraction || args.entityType !== 'policy' || !args.entityId) {
    return;
  }

  await args.tx
    .update(policies)
    .set({
      provider:
        typeof args.correctedExtraction.provider === 'string'
          ? args.correctedExtraction.provider
          : null,
      policyNumber:
        typeof args.correctedExtraction.policyNumber === 'string'
          ? args.correctedExtraction.policyNumber
          : null,
      analysisJson: args.correctedExtraction,
    })
    .where(and(eq(policies.id, args.entityId), eq(policies.tenantId, args.tenantId)));
}

export async function submitAiReview(args: {
  runId: string;
  tenantId: string;
  reviewerId: string;
  reviewerRole: string | null | undefined;
  action: ReviewAction;
  correctedExtraction?: Record<string, unknown>;
}): Promise<SubmitAiReviewResult> {
  const [existingRun] = await db
    .select({
      id: aiRuns.id,
      workflow: aiRuns.workflow,
      entityType: aiRuns.entityType,
      entityId: aiRuns.entityId,
      extractionReviewStatus: documentExtractions.reviewStatus,
      extractionJson: documentExtractions.extractedJson,
      extractionWarnings: documentExtractions.warnings,
    })
    .from(aiRuns)
    .leftJoin(documentExtractions, eq(documentExtractions.sourceRunId, aiRuns.id))
    .where(and(eq(aiRuns.id, args.runId), eq(aiRuns.tenantId, args.tenantId)))
    .limit(1);

  if (!existingRun) {
    return { kind: 'notFound' };
  }

  const nextReviewStatus = getReviewStatus(args.action);
  const correctedPayload = resolveCorrectedReviewPayload({
    action: args.action,
    workflow: existingRun.workflow,
    correctedExtraction: args.correctedExtraction,
  });
  if (correctedPayload.kind === 'unprocessable') {
    return correctedPayload;
  }

  await db.transaction(async tx => {
    await tx
      .update(aiRuns)
      .set({
        reviewStatus: nextReviewStatus,
        reviewedBy: args.reviewerId,
        outputJson: correctedPayload.correctedExtraction ?? undefined,
      })
      .where(and(eq(aiRuns.id, args.runId), eq(aiRuns.tenantId, args.tenantId)));

    await tx
      .update(documentExtractions)
      .set(
        buildExtractionReviewUpdate({
          nextReviewStatus,
          reviewerId: args.reviewerId,
          correctedExtraction: correctedPayload.correctedExtraction,
          correctedWarnings: correctedPayload.correctedWarnings,
        })
      )
      .where(
        and(
          eq(documentExtractions.sourceRunId, args.runId),
          eq(documentExtractions.reviewStatus, existingRun.extractionReviewStatus ?? 'pending'),
          eq(documentExtractions.tenantId, args.tenantId)
        )
      );

    await syncReviewedPolicyExtraction({
      tx,
      correctedExtraction: correctedPayload.correctedExtraction,
      entityType: existingRun.entityType,
      entityId: existingRun.entityId,
      tenantId: args.tenantId,
    });
  });

  return {
    kind: 'ok',
    data: {
      id: args.runId,
      reviewStatus: nextReviewStatus,
    },
  };
}
