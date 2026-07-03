import {
  type ExtractionCandidate,
  buildSanitizedContentMetrics,
  readCandidateConfidence,
  readCandidateWarnings,
  type SanitizedContentMetrics,
} from '@/lib/ai/extraction-pipeline';
import { db } from '@/lib/db.server';
import { aiRuns, documents } from '@interdomestik/database/schema';
import { and, eq, isNull } from 'drizzle-orm';

import { throwDeletedDocumentError } from './_document-lifecycle-guard';
import type { ClaimedPolicyRun, PolicyExtractionDeps } from './_pipeline-input';

export type LoadedPolicyInput = ClaimedPolicyRun & {
  fileName: string;
  mimeType: string;
  fileUrl: string;
  fileBuffer: Buffer;
  parsedText: string | null;
  metrics: SanitizedContentMetrics;
};

function isImageUpload(fileName: string, mimeType: string) {
  if (mimeType.startsWith('image/')) return true;
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp')
  );
}

function getRequestStringValue(requestJson: Record<string, unknown>, key: 'fileName' | 'mimeType') {
  const value = requestJson[key];
  return typeof value === 'string' ? value : '';
}

function getRequestFileUrl(requestJson: Record<string, unknown>, fallback: unknown) {
  const value = requestJson.fileUrl;
  if (typeof value === 'string' && value.length > 0) return value;
  return typeof fallback === 'string' ? fallback : '';
}

async function assertActivePolicyDocument(run: ClaimedPolicyRun) {
  // db-access-guard: tenant-scoped -- reason: pre-download liveness check is constrained by exact runId, tenantId, and documentId before policy AI processing
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

  if (!activeRun) throwDeletedDocumentError();
}

export async function loadPolicyInput(
  run: ClaimedPolicyRun,
  deps: PolicyExtractionDeps
): Promise<LoadedPolicyInput> {
  const requestJson = run.requestJson && typeof run.requestJson === 'object' ? run.requestJson : {};
  const fileName = getRequestStringValue(requestJson, 'fileName');
  const mimeType = getRequestStringValue(requestJson, 'mimeType');
  const fileUrl = getRequestFileUrl(requestJson, run.storagePath);
  if (!fileUrl) throw new Error('Queued policy analysis run is missing a storage path.');

  await assertActivePolicyDocument(run);

  const fileBuffer = await deps.downloadFile(fileUrl, run.tenantId);
  const parsedText = isImageUpload(fileName, mimeType) ? null : await deps.analyzePdf(fileBuffer);
  if (parsedText !== null && parsedText.trim().length === 0) {
    throw new Error('Policy document could not be parsed into text.');
  }

  return {
    ...run,
    fileName,
    mimeType,
    fileUrl,
    fileBuffer,
    parsedText,
    metrics: buildSanitizedContentMetrics({ buffer: fileBuffer, parsedText }),
  };
}

export async function extractPolicyCandidate(
  input: LoadedPolicyInput,
  deps: PolicyExtractionDeps
): Promise<ExtractionCandidate> {
  const candidate =
    input.parsedText === null
      ? await deps.analyzeImage(input.fileBuffer)
      : await deps.analyzeText(input.parsedText);

  return {
    candidate,
    rawConfidence: readCandidateConfidence(candidate),
    warnings: readCandidateWarnings(candidate),
  };
}
