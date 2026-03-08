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

function getReviewStatus(action: ReviewAction): 'approved' | 'rejected' | 'corrected' {
  if (action === 'approve') return 'approved';
  if (action === 'reject') return 'rejected';
  return 'corrected';
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
  let correctedExtraction: Record<string, unknown> | undefined;
  let correctedWarnings: string[] | undefined;

  if (args.action === 'correct') {
    if (!args.correctedExtraction || typeof args.correctedExtraction !== 'object') {
      return { kind: 'unprocessable', message: 'Corrected extraction is required.' };
    }

    const parser =
      existingRun.workflow === 'policy_extract'
        ? policyExtractSchema
        : existingRun.workflow === 'claim_intake_extract'
          ? claimIntakeExtractSchema
          : existingRun.workflow === 'legal_doc_extract'
            ? legalDocExtractSchema
            : null;

    if (parser) {
      const parsed = parser.safeParse(args.correctedExtraction);
      if (!parsed.success) {
        return { kind: 'unprocessable', message: 'Invalid corrected extraction payload.' };
      }

      correctedExtraction = parsed.data;
      correctedWarnings = parsed.data.warnings;
    } else {
      correctedExtraction = args.correctedExtraction;
      correctedWarnings = Array.isArray(args.correctedExtraction.warnings)
        ? args.correctedExtraction.warnings.filter(
            (warning): warning is string => typeof warning === 'string'
          )
        : [];
    }
  }

  await db.transaction(async tx => {
    await tx
      .update(aiRuns)
      .set({
        reviewStatus: nextReviewStatus,
        reviewedBy: args.reviewerId,
        outputJson: correctedExtraction ?? undefined,
      })
      .where(and(eq(aiRuns.id, args.runId), eq(aiRuns.tenantId, args.tenantId)));

    const extractionUpdate: Record<string, unknown> = {
      reviewStatus: nextReviewStatus,
      reviewedBy: args.reviewerId,
    };

    if (correctedExtraction) {
      extractionUpdate.extractedJson = correctedExtraction;
      extractionUpdate.warnings = correctedWarnings ?? [];
      extractionUpdate.updatedAt = new Date();
    }

    await tx
      .update(documentExtractions)
      .set(extractionUpdate)
      .where(
        and(
          eq(documentExtractions.sourceRunId, args.runId),
          eq(documentExtractions.reviewStatus, existingRun.extractionReviewStatus ?? 'pending'),
          eq(documentExtractions.tenantId, args.tenantId)
        )
      );

    if (correctedExtraction && existingRun.entityType === 'policy' && existingRun.entityId) {
      await tx
        .update(policies)
        .set({
          provider:
            typeof correctedExtraction.provider === 'string' ? correctedExtraction.provider : null,
          policyNumber:
            typeof correctedExtraction.policyNumber === 'string'
              ? correctedExtraction.policyNumber
              : null,
          analysisJson: correctedExtraction,
        })
        .where(and(eq(policies.id, existingRun.entityId), eq(policies.tenantId, args.tenantId)));
    }
  });

  return {
    kind: 'ok',
    data: {
      id: args.runId,
      reviewStatus: nextReviewStatus,
    },
  };
}
