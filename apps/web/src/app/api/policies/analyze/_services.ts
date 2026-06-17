import { createHash } from 'node:crypto';

import {
  type PolicyAnalysis,
  analyzePolicyImages,
  analyzePolicyText,
} from '@/lib/ai/policy-analyzer';
import { markAiRunDispatchFailedWithTenantContext } from '@/lib/ai/dispatch-failure';
import {
  ExtractionPipelineError,
  critiqueExtraction,
  validateExtractionCandidate,
} from '@/lib/ai/extraction-pipeline';
import { inngest } from '@/lib/inngest/client';
import { throwTransientRetryFailure, withTransientRetry } from '@/lib/reliability/transient-retry';
import { uploadTenantObject } from '@/lib/storage/service-role';
import { POLICIES_BUCKET, buildPolicyStoragePath } from '@/lib/storage/tenant-prefix';
import { withTenantContext } from '@interdomestik/database';
import { aiRuns, documents, policies } from '@interdomestik/database/schema';
import { getResponsesWorkflowConfig } from '@interdomestik/domain-ai/models';
import { policyExtractSchema } from '@interdomestik/domain-ai/schemas/policy-extract';
import { nanoid } from 'nanoid';

import { extractPolicyCandidate, loadPolicyInput } from './_pipeline-file';
import { claimPolicyExtractionRun, type PolicyExtractionDeps } from './_pipeline-input';
import { markPolicyExtractionRunFailed, persistPolicyExtraction } from './_pipeline-persist';
import { downloadPolicyFileWithRetry } from './_storage-download';

const RESOLVED_POLICIES_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || POLICIES_BUCKET;
const POLICY_EXTRACT_WORKFLOW = 'policy_extract' as const;
const POLICY_EXTRACT_CONFIG = getResponsesWorkflowConfig(POLICY_EXTRACT_WORKFLOW);

function buildPolicyInputHash(args: {
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}) {
  return createHash('sha256').update(JSON.stringify(args)).digest('hex');
}

type QueuePolicyAnalysisArgs = {
  tenantId: string;
  userId: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

type PolicyExtractRequestedEvent = {
  runId: string;
  tenantId: string;
  policyId: string;
  userId: string;
};

type ProcessPolicyAnalysisDeps = Partial<PolicyExtractionDeps>;

export async function uploadPolicyFileService(args: {
  userId: string;
  tenantId: string;
  file: File;
  buffer: Buffer;
  safeName: string;
}) {
  const filePath = buildPolicyStoragePath({
    bucket: RESOLVED_POLICIES_BUCKET,
    fileName: `${Date.now()}_${args.safeName}`,
    tenantId: args.tenantId,
    userId: args.userId,
  });
  const { error } = await uploadTenantObject({
    bucket: RESOLVED_POLICIES_BUCKET,
    body: args.buffer,
    contentType: args.file.type || 'application/octet-stream',
    context: 'policy upload',
    family: 'policies',
    path: filePath,
    tenantId: args.tenantId,
    upsert: false,
  });

  if (error) {
    console.error('Supabase policy upload error:', error);
    return { ok: false as const, error: 'Failed to upload policy file' };
  }

  return { ok: true as const, filePath };
}

export async function analyzePdfService(buffer: Buffer): Promise<string> {
  try {
    const pdfModule = await import('pdf-parse');
    const pdf = pdfModule.default ?? pdfModule;
    const pdfData = await pdf(buffer);
    return pdfData.text;
  } catch (pdfError: unknown) {
    console.error('PDF Parse Error:', pdfError);
    return '';
  }
}

export async function queuePolicyAnalysisService(
  data: QueuePolicyAnalysisArgs
): Promise<{ policyId: string; runId: string }> {
  return withTenantContext({ tenantId: data.tenantId, role: 'system' }, async tx => {
    const policyId = nanoid();
    const documentId = nanoid();
    const runId = nanoid();
    const now = new Date();

    await tx
      .insert(policies)
      .values({
        id: policyId,
        tenantId: data.tenantId,
        userId: data.userId,
        provider: null,
        policyNumber: null,
        analysisJson: {},
        fileUrl: data.fileUrl,
      })
      .returning();

    await tx.insert(documents).values({
      id: documentId,
      tenantId: data.tenantId,
      entityType: 'policy',
      entityId: policyId,
      fileName: data.fileName,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      storagePath: data.fileUrl,
      category: 'contract',
      description: 'Policy upload recorded for queued AI analysis.',
      uploadedBy: data.userId,
      uploadedAt: now,
    });

    await tx.insert(aiRuns).values({
      id: runId,
      tenantId: data.tenantId,
      workflow: POLICY_EXTRACT_WORKFLOW,
      status: 'queued',
      documentId,
      entityType: 'policy',
      entityId: policyId,
      requestedBy: data.userId,
      model: POLICY_EXTRACT_CONFIG.model,
      modelSnapshot: POLICY_EXTRACT_CONFIG.model,
      promptVersion: POLICY_EXTRACT_CONFIG.promptVersion,
      inputHash: buildPolicyInputHash(data),
      requestJson: {
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        promptCacheKey: POLICY_EXTRACT_CONFIG.promptCacheKey,
      },
      reviewStatus: 'pending',
      createdAt: now,
    });

    return { policyId, runId };
  });
}

export async function emitPolicyExtractionRequestedService(args: PolicyExtractRequestedEvent) {
  const result = await withTransientRetry(
    () =>
      inngest.send({
        name: 'policy/extract.requested',
        data: args,
      }),
    { initialDelayMs: 200, maxDelayMs: 1_000, maxElapsedMs: 10_000 }
  );

  if (!result.ok) {
    throwTransientRetryFailure(result, 'Failed to dispatch policy extraction.');
  }
}

export async function markPolicyAnalysisRunDispatchFailedService(args: {
  runId: string;
  message: string;
}) {
  await markAiRunDispatchFailedWithTenantContext({
    entityType: 'policy',
    errorCode: 'policy_extract_dispatch_failed',
    message: args.message,
    runId: args.runId,
    workflow: POLICY_EXTRACT_WORKFLOW,
  });
}

async function downloadPolicyFileService(filePath: string, tenantId: string): Promise<Buffer> {
  return downloadPolicyFileWithRetry({
    bucket: RESOLVED_POLICIES_BUCKET,
    filePath,
    tenantId,
  });
}

export async function processPolicyAnalysisRunService(args: {
  runId: string;
  deps?: ProcessPolicyAnalysisDeps;
}): Promise<{
  status: 'completed' | 'failed' | 'skipped';
  runId: string;
  policyId: string;
  analysis?: PolicyAnalysis;
}> {
  const { runId } = args;
  const deps = {
    downloadFile: args.deps?.downloadFile ?? downloadPolicyFileService,
    analyzeImage:
      args.deps?.analyzeImage ?? (async (buffer: Buffer) => analyzePolicyImages([buffer])),
    analyzePdf: args.deps?.analyzePdf ?? analyzePdfService,
    analyzeText: args.deps?.analyzeText ?? analyzePolicyText,
  };

  const claimed = await claimPolicyExtractionRun(runId);
  if (claimed.status === 'skipped') return { status: 'skipped', runId, policyId: claimed.policyId };

  try {
    const input = await loadPolicyInput(claimed.run, deps);
    const extractionCandidate = await extractPolicyCandidate(input, deps);
    const policyExtract = validateExtractionCandidate(
      POLICY_EXTRACT_WORKFLOW,
      policyExtractSchema,
      extractionCandidate.candidate
    );
    const critique = critiqueExtraction({
      confidence: extractionCandidate.rawConfidence,
      warnings: extractionCandidate.warnings,
      metrics: input.metrics,
    });
    if (!critique.persistenceAllowed) {
      throw new ExtractionPipelineError(
        'policy_extract_critique_failed',
        'policy_extract output failed critique.'
      );
    }

    await persistPolicyExtraction({ run: claimed.run, extraction: policyExtract, critique });

    return {
      status: 'completed',
      runId,
      policyId: claimed.run.policyId,
      analysis: policyExtract,
    };
  } catch (error) {
    await markPolicyExtractionRunFailed({ run: claimed.run, error });
    if (error instanceof ExtractionPipelineError) {
      return { status: 'failed', runId, policyId: claimed.run.policyId };
    }
    throw error;
  }
}
