import { createHash } from 'node:crypto';

import {
  type PolicyAnalysis,
  analyzePolicyImages,
  analyzePolicyText,
} from '@/lib/ai/policy-analyzer';
import { db } from '@/lib/db.server';
import { inngest } from '@/lib/inngest/client';
import { downloadTenantObject, uploadTenantObject } from '@/lib/storage/service-role';
import { POLICIES_BUCKET, buildPolicyStoragePath } from '@/lib/storage/tenant-prefix';
import { aiRuns, documentExtractions, documents, policies } from '@interdomestik/database/schema';
import { getResponsesWorkflowConfig } from '@interdomestik/domain-ai/models';
import { policyExtractSchema } from '@interdomestik/domain-ai/schemas/policy-extract';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

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

function isImageUpload(fileName: string, mimeType: string) {
  if (mimeType.startsWith('image/')) {
    return true;
  }

  const lower = fileName.toLowerCase();
  return (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp')
  );
}

function getRequestStringValue(
  requestJson: Record<string, unknown>,
  key: 'fileName' | 'mimeType'
): string {
  const value = requestJson[key];
  return typeof value === 'string' ? value : '';
}

function getRequestFileUrl(requestJson: Record<string, unknown>, fallback: unknown): string {
  const value = requestJson.fileUrl;
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return typeof fallback === 'string' ? fallback : '';
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

type ProcessPolicyAnalysisDeps = {
  downloadFile?: (filePath: string, tenantId: string) => Promise<Buffer>;
  analyzeImage?: (buffer: Buffer) => Promise<PolicyAnalysis>;
  analyzePdf?: (buffer: Buffer) => Promise<string>;
  analyzeText?: (text: string) => Promise<PolicyAnalysis>;
};

/**
 * Service: Upload policy file to Supabase Storage
 */
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

/**
 * Service: Parse text from PDF buffer
 */
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
  // db-access-guard: tenant-scoped -- reason: tenantId comes from validated AI policy queue input or queued run row
  return db.transaction(async tx => {
    const policyId = nanoid();
    const documentId = nanoid();
    const runId = nanoid();
    const now = new Date();

    // db-access-guard: tenant-scoped -- reason: tenantId comes from validated AI policy queue input or queued run row
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

    // db-access-guard: tenant-scoped -- reason: tenantId comes from validated AI policy queue input or queued run row
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

    // db-access-guard: tenant-scoped -- reason: tenantId comes from validated AI policy queue input or queued run row
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
  await inngest.send({
    name: 'policy/extract.requested',
    data: args,
  });
}

export async function markPolicyAnalysisRunDispatchFailedService(args: {
  runId: string;
  message: string;
}) {
  // db-access-guard: tenant-scoped -- reason: tenantId comes from validated AI policy queue input or queued run row
  await db
    .update(aiRuns)
    .set({
      status: 'failed',
      completedAt: new Date(),
      errorCode: 'policy_extract_dispatch_failed',
      errorMessage: args.message,
    })
    .where(and(eq(aiRuns.id, args.runId), eq(aiRuns.status, 'queued')));
}

async function downloadPolicyFileService(filePath: string, tenantId: string): Promise<Buffer> {
  const { data, error } = await downloadTenantObject({
    bucket: RESOLVED_POLICIES_BUCKET,
    context: 'policy analysis download',
    family: 'policies',
    path: filePath,
    tenantId,
  });

  if (error || !data) {
    throw new Error('Failed to download queued policy document.');
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function processPolicyAnalysisRunService(args: {
  runId: string;
  deps?: ProcessPolicyAnalysisDeps;
}): Promise<{
  status: 'completed' | 'skipped';
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

  // db-access-guard: tenant-scoped -- reason: tenantId comes from validated AI policy queue input or queued run row
  const [queuedRun] = await db
    .select({
      runId: aiRuns.id,
      tenantId: aiRuns.tenantId,
      documentId: aiRuns.documentId,
      policyId: aiRuns.entityId,
      storagePath: documents.storagePath,
      requestJson: aiRuns.requestJson,
      status: aiRuns.status,
    })
    .from(aiRuns)
    .innerJoin(documents, eq(documents.id, aiRuns.documentId))
    .where(
      and(
        eq(aiRuns.id, runId),
        eq(aiRuns.workflow, POLICY_EXTRACT_WORKFLOW),
        eq(aiRuns.entityType, 'policy')
      )
    );

  if (!queuedRun || !queuedRun.documentId || !queuedRun.policyId) {
    throw new Error(`Queued policy analysis run ${runId} was not found.`);
  }

  const documentId = queuedRun.documentId;
  const policyId = queuedRun.policyId;

  if (queuedRun.status === 'completed') {
    return {
      status: 'skipped',
      runId,
      policyId,
    };
  }

  if (queuedRun.status !== 'queued') {
    return {
      status: 'skipped',
      runId,
      policyId,
    };
  }

  const startedAt = new Date();
  // db-access-guard: tenant-scoped -- reason: tenantId comes from validated AI policy queue input or queued run row
  const [claimedRun] = await db
    .update(aiRuns)
    .set({
      status: 'processing',
      startedAt,
      errorCode: null,
      errorMessage: null,
    })
    .where(and(eq(aiRuns.id, runId), eq(aiRuns.status, 'queued')))
    .returning({ id: aiRuns.id });

  if (!claimedRun) {
    return {
      status: 'skipped',
      runId,
      policyId,
    };
  }

  try {
    const requestJson = queuedRun.requestJson ?? {};
    const fileName = getRequestStringValue(requestJson, 'fileName');
    const mimeType = getRequestStringValue(requestJson, 'mimeType');
    const fileUrl = getRequestFileUrl(requestJson, queuedRun.storagePath);
    if (!fileUrl) {
      throw new Error('Queued policy analysis run is missing a storage path.');
    }
    const fileBuffer = await deps.downloadFile(fileUrl, queuedRun.tenantId);
    let analysis: PolicyAnalysis;

    if (isImageUpload(fileName, mimeType)) {
      analysis = await deps.analyzeImage(fileBuffer);
    } else {
      const extractedText = await deps.analyzePdf(fileBuffer);
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('Policy document could not be parsed into text.');
      }

      analysis = await deps.analyzeText(extractedText);
    }

    const policyExtract = policyExtractSchema.parse(analysis);
    const completedAt = new Date();

    // db-access-guard: tenant-scoped -- reason: tenantId comes from validated AI policy queue input or queued run row
    await db.transaction(async tx => {
      // db-access-guard: tenant-scoped -- reason: tenantId comes from validated AI policy queue input or queued run row
      await tx
        .update(policies)
        .set({
          provider: policyExtract.provider ?? null,
          policyNumber: policyExtract.policyNumber ?? null,
          analysisJson: policyExtract,
        })
        .where(eq(policies.id, policyId));

      // db-access-guard: tenant-scoped -- reason: tenantId comes from validated AI policy queue input or queued run row
      await tx
        .insert(documentExtractions)
        .values({
          id: nanoid(),
          tenantId: queuedRun.tenantId,
          documentId,
          entityType: 'policy',
          entityId: policyId,
          workflow: POLICY_EXTRACT_WORKFLOW,
          schemaVersion: POLICY_EXTRACT_CONFIG.promptVersion,
          extractedJson: policyExtract,
          warnings: policyExtract.warnings,
          sourceRunId: runId,
          reviewStatus: 'pending',
          createdAt: completedAt,
          updatedAt: completedAt,
        })
        .onConflictDoNothing({ target: documentExtractions.sourceRunId });

      // db-access-guard: tenant-scoped -- reason: tenantId comes from validated AI policy queue input or queued run row
      await tx
        .update(aiRuns)
        .set({
          status: 'completed',
          responseJson: {
            event: 'policy/extract.requested',
            runId,
          },
          outputJson: policyExtract,
          reviewStatus: 'pending',
          completedAt,
          errorCode: null,
          errorMessage: null,
        })
        .where(eq(aiRuns.id, runId));
    });

    return {
      status: 'completed',
      runId,
      policyId,
      analysis: policyExtract,
    };
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : 'Policy extraction failed.';

    // db-access-guard: tenant-scoped -- reason: tenantId comes from validated AI policy queue input or queued run row
    await db
      .update(aiRuns)
      .set({
        status: 'failed',
        completedAt,
        errorCode: 'policy_extract_failed',
        errorMessage: message,
      })
      .where(eq(aiRuns.id, runId));

    throw error;
  }
}
