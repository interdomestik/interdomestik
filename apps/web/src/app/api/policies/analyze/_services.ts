import { createHash } from 'node:crypto';

import { db } from '@/lib/db.server';
import { createAdminClient } from '@interdomestik/database';
import { aiRuns, documentExtractions, documents, policies } from '@interdomestik/database/schema';
import { nanoid } from 'nanoid';

const POLICIES_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || 'policies';

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

/**
 * Service: Save policy record to database
 */
function buildPolicyInputHash(fileUrl: string, analysisJson: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify({ fileUrl, analysisJson })).digest('hex');
}

export async function savePolicyService(data: {
  tenantId: string;
  userId: string;
  provider: string | null;
  policyNumber: string | null;
  analysisJson: Record<string, unknown>;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}) {
  return db.transaction(async tx => {
    const policyId = nanoid();
    const documentId = nanoid();
    const runId = nanoid();
    const extractionId = nanoid();
    const now = new Date();

    const [insertedPolicy] = await tx
      .insert(policies)
      .values({
        id: policyId,
        tenantId: data.tenantId,
        userId: data.userId,
        provider: data.provider,
        policyNumber: data.policyNumber,
        analysisJson: data.analysisJson,
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
      description: 'Policy upload recorded for AI analysis provenance.',
      uploadedBy: data.userId,
      uploadedAt: now,
    });

    await tx.insert(aiRuns).values({
      id: runId,
      tenantId: data.tenantId,
      workflow: 'policy_analysis_sync',
      status: 'completed',
      documentId,
      entityType: 'policy',
      entityId: policyId,
      requestedBy: data.userId,
      model: 'legacy-policy-analyzer',
      modelSnapshot: 'legacy-policy-analyzer',
      promptVersion: 'legacy_policy_analysis_sync_v1',
      inputHash: buildPolicyInputHash(data.fileUrl, data.analysisJson),
      requestJson: {
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
      },
      outputJson: data.analysisJson,
      reviewStatus: 'not_requested',
      startedAt: now,
      completedAt: now,
      createdAt: now,
    });

    await tx.insert(documentExtractions).values({
      id: extractionId,
      tenantId: data.tenantId,
      documentId,
      entityType: 'policy',
      entityId: policyId,
      workflow: 'policy_analysis_sync',
      schemaVersion: 'policy_extract_v1',
      extractedJson: data.analysisJson,
      warnings: [],
      sourceRunId: runId,
      reviewStatus: 'not_requested',
      createdAt: now,
      updatedAt: now,
    });

    return insertedPolicy;
  });
}
