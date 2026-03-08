import { createHash } from 'node:crypto';

import {
  type PolicyAnalysis,
  analyzePolicyImages,
  analyzePolicyText,
} from '@/lib/ai/policy-analyzer';
import { db } from '@/lib/db.server';
import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@interdomestik/database';
import { aiRuns, documentExtractions, documents, policies } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const POLICIES_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || 'policies';

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
  downloadFile?: (filePath: string) => Promise<Buffer>;
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
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false as const,
      error: 'Supabase service role key is required for policy uploads.',
    };
  }

  const filePath = `pii/tenants/${args.tenantId}/policies/${args.userId}/${Date.now()}_${args.safeName}`;
  const adminClient = createAdminClient();
  const { error } = await adminClient.storage.from(POLICIES_BUCKET).upload(filePath, args.buffer, {
    contentType: args.file.type || 'application/octet-stream',
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
  return db.transaction(async tx => {
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
      workflow: 'policy_extract',
      status: 'queued',
      documentId,
      entityType: 'policy',
      entityId: policyId,
      requestedBy: data.userId,
      model: 'gpt-5.4',
      modelSnapshot: 'gpt-5.4',
      promptVersion: 'policy_extract_v1',
      inputHash: buildPolicyInputHash(data),
      requestJson: {
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
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

async function downloadPolicyFileService(filePath: string): Promise<Buffer> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage.from(POLICIES_BUCKET).download(filePath);

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

  const [queuedRun] = await db
    .select({
      runId: aiRuns.id,
      tenantId: aiRuns.tenantId,
      documentId: aiRuns.documentId,
      policyId: aiRuns.entityId,
      fileUrl: aiRuns.requestJson,
      requestJson: aiRuns.requestJson,
      status: aiRuns.status,
    })
    .from(aiRuns)
    .where(
      and(
        eq(aiRuns.id, runId),
        eq(aiRuns.workflow, 'policy_extract'),
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

  const startedAt = new Date();
  await db
    .update(aiRuns)
    .set({
      status: 'processing',
      startedAt,
      errorCode: null,
      errorMessage: null,
    })
    .where(eq(aiRuns.id, runId));

  try {
    const requestJson = queuedRun.requestJson ?? {};
    const fileName = getRequestStringValue(requestJson, 'fileName');
    const mimeType = getRequestStringValue(requestJson, 'mimeType');
    const fileUrl = getRequestFileUrl(requestJson, queuedRun.fileUrl);
    const fileBuffer = await deps.downloadFile(fileUrl);
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

    const completedAt = new Date();

    await db.transaction(async tx => {
      await tx
        .update(policies)
        .set({
          provider: analysis.provider ?? null,
          policyNumber: analysis.policyNumber ?? null,
          analysisJson: analysis,
        })
        .where(eq(policies.id, policyId));

      await tx.insert(documentExtractions).values({
        id: nanoid(),
        tenantId: queuedRun.tenantId,
        documentId,
        entityType: 'policy',
        entityId: policyId,
        workflow: 'policy_extract',
        schemaVersion: 'policy_extract_v1',
        extractedJson: analysis,
        warnings: [],
        sourceRunId: runId,
        reviewStatus: 'pending',
        createdAt: completedAt,
        updatedAt: completedAt,
      });

      await tx
        .update(aiRuns)
        .set({
          status: 'completed',
          responseJson: {
            event: 'policy/extract.requested',
            runId,
          },
          outputJson: analysis,
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
      analysis,
    };
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : 'Policy extraction failed.';

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
