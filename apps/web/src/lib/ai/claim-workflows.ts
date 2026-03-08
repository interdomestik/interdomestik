import { extractClaimIntake } from '@interdomestik/domain-ai/claims/intake-extract';
import { extractLegalDocument } from '@interdomestik/domain-ai/legal/extract';
import { db } from '@/lib/db.server';
import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@interdomestik/database';
import { aiRuns, claims, documentExtractions, documents } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

type ClaimAiWorkflow = 'claim_intake_extract' | 'legal_doc_extract';

type QueuedClaimAiRun = {
  runId: string;
  workflow: ClaimAiWorkflow;
  claimId: string;
  documentId: string;
};

type ProcessClaimDocumentWorkflowDeps = {
  downloadFile?: (bucket: string, filePath: string) => Promise<Buffer>;
  analyzePdf?: (buffer: Buffer, mimeType: string) => Promise<string>;
};

function getEventName(workflow: ClaimAiWorkflow) {
  return workflow === 'legal_doc_extract'
    ? 'legal/extract.requested'
    : 'claim/intake-extract.requested';
}

async function downloadFileFromStorage(bucket: string, filePath: string): Promise<Buffer> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage.from(bucket).download(filePath);

  if (error || !data) {
    throw new Error('Failed to download queued claim document.');
  }

  return Buffer.from(await data.arrayBuffer());
}

async function analyzeDocumentAsText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'text/plain') {
    return buffer.toString('utf8');
  }

  if (mimeType !== 'application/pdf') {
    return '';
  }

  const pdfModule = await import('pdf-parse');
  const pdf = pdfModule.default ?? pdfModule;
  const result = await pdf(buffer);
  return result.text ?? '';
}

function getBucketFromRequestJson(requestJson: Record<string, unknown> | null | undefined) {
  const value = requestJson?.bucket;
  return typeof value === 'string' && value.length > 0
    ? value
    : process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || 'claim-evidence';
}

export async function emitClaimAiRunRequestedService(queuedRun: QueuedClaimAiRun) {
  await inngest.send({
    name: getEventName(queuedRun.workflow),
    data: queuedRun,
  });
}

export async function markClaimAiRunDispatchFailedService(args: {
  runId: string;
  message: string;
}) {
  await db
    .update(aiRuns)
    .set({
      status: 'failed',
      completedAt: new Date(),
      errorCode: 'claim_ai_dispatch_failed',
      errorMessage: args.message,
    })
    .where(and(eq(aiRuns.id, args.runId), eq(aiRuns.status, 'queued')));
}

export async function processClaimDocumentWorkflowRunService(args: {
  runId: string;
  deps?: ProcessClaimDocumentWorkflowDeps;
}): Promise<{
  status: 'completed' | 'skipped';
  runId: string;
  claimId: string;
  workflow: ClaimAiWorkflow;
  extraction?: Record<string, unknown>;
}> {
  const downloadFile = args.deps?.downloadFile ?? downloadFileFromStorage;
  const analyzePdf = args.deps?.analyzePdf ?? analyzeDocumentAsText;

  const [queuedRun] = await db
    .select({
      runId: aiRuns.id,
      tenantId: aiRuns.tenantId,
      workflow: aiRuns.workflow,
      documentId: aiRuns.documentId,
      claimId: aiRuns.entityId,
      storagePath: documents.storagePath,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
      uploadedAt: documents.uploadedAt,
      status: aiRuns.status,
      requestJson: aiRuns.requestJson,
      claimTitle: claims.title,
      claimDescription: claims.description,
      claimCategory: claims.category,
      claimCompanyName: claims.companyName,
      claimAmount: claims.claimAmount,
      claimCurrency: claims.currency,
    })
    .from(aiRuns)
    .innerJoin(
      documents,
      and(eq(documents.id, aiRuns.documentId), eq(documents.tenantId, aiRuns.tenantId))
    )
    .innerJoin(claims, and(eq(claims.id, aiRuns.entityId), eq(claims.tenantId, aiRuns.tenantId)))
    .where(and(eq(aiRuns.id, args.runId), eq(aiRuns.entityType, 'claim')));

  if (
    !queuedRun ||
    !queuedRun.documentId ||
    !queuedRun.claimId ||
    (queuedRun.workflow !== 'claim_intake_extract' && queuedRun.workflow !== 'legal_doc_extract')
  ) {
    throw new Error(`Queued claim AI run ${args.runId} was not found.`);
  }

  const workflow = queuedRun.workflow;

  if (queuedRun.status === 'completed' || queuedRun.status === 'failed') {
    return {
      status: 'skipped',
      runId: args.runId,
      claimId: queuedRun.claimId,
      workflow,
    };
  }

  const [claimedRun] = await db
    .update(aiRuns)
    .set({
      status: 'processing',
      startedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    })
    .where(and(eq(aiRuns.id, args.runId), eq(aiRuns.status, 'queued')))
    .returning({ id: aiRuns.id });

  if (!claimedRun) {
    return {
      status: 'skipped',
      runId: args.runId,
      claimId: queuedRun.claimId,
      workflow,
    };
  }

  try {
    const requestJson =
      queuedRun.requestJson && typeof queuedRun.requestJson === 'object'
        ? (queuedRun.requestJson as Record<string, unknown>)
        : {};
    const buffer = await downloadFile(getBucketFromRequestJson(requestJson), queuedRun.storagePath);
    const documentText = await analyzePdf(buffer, queuedRun.mimeType);
    const extraction =
      workflow === 'legal_doc_extract'
        ? await extractLegalDocument({
            documentText,
            fileName: queuedRun.fileName,
            uploadedAt: queuedRun.uploadedAt,
          })
        : await extractClaimIntake({
            claim: {
              title: queuedRun.claimTitle,
              description: queuedRun.claimDescription,
              category: queuedRun.claimCategory,
              claimAmount: queuedRun.claimAmount,
              currency: queuedRun.claimCurrency,
            },
            claimSnapshot:
              'claimSnapshot' in requestJson
                ? ((requestJson.claimSnapshot as Record<string, unknown> | null) ?? null)
                : null,
            documentText,
            uploadedAt: queuedRun.uploadedAt,
          });

    const completedAt = new Date();
    const extractionRow: typeof documentExtractions.$inferInsert = {
      id: nanoid(),
      tenantId: queuedRun.tenantId,
      documentId: queuedRun.documentId,
      entityType: 'claim',
      entityId: queuedRun.claimId,
      workflow,
      schemaVersion:
        workflow === 'legal_doc_extract' ? 'legal_doc_extract_v1' : 'claim_intake_extract_v1',
      extractedJson: extraction,
      warnings: Array.isArray(extraction.warnings)
        ? extraction.warnings.filter((warning): warning is string => typeof warning === 'string')
        : [],
      sourceRunId: args.runId,
      reviewStatus: 'pending',
      createdAt: completedAt,
      updatedAt: completedAt,
    };

    await db.transaction(async tx => {
      await tx
        .insert(documentExtractions)
        .values(extractionRow)
        .onConflictDoNothing({ target: documentExtractions.sourceRunId });

      await tx
        .update(aiRuns)
        .set({
          status: 'completed',
          responseJson: {
            event: getEventName(workflow),
            runId: args.runId,
          },
          outputJson: extraction,
          reviewStatus: 'pending',
          completedAt,
          errorCode: null,
          errorMessage: null,
        })
        .where(eq(aiRuns.id, args.runId));
    });

    return {
      status: 'completed',
      runId: args.runId,
      claimId: queuedRun.claimId,
      workflow,
      extraction,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Claim AI workflow failed.';

    await db
      .update(aiRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorCode: 'claim_ai_processing_failed',
        errorMessage: message,
      })
      .where(eq(aiRuns.id, args.runId));

    throw error;
  }
}
