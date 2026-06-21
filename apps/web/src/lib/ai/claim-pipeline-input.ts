import {
  type ExtractionCandidate,
  buildSanitizedContentMetrics,
  readCandidateConfidence,
  readCandidateWarnings,
  type SanitizedContentMetrics,
  validateExtractionCandidate,
} from '@/lib/ai/extraction-pipeline';
import { extractClaimIntake } from '@interdomestik/domain-ai/claims/intake-extract';
import { extractLegalDocument } from '@interdomestik/domain-ai/legal/extract';
import { claimIntakeExtractSchema } from '@interdomestik/domain-ai/schemas/claim-intake-extract';
import { legalDocExtractSchema } from '@interdomestik/domain-ai/schemas/legal-doc-extract';
import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';

import { readClaimPipelineAiCallContext } from './claim-pipeline-ai-context';
import type { ClaimedClaimAiRun } from './claim-pipeline-run';

export type ClaimPipelineDeps = {
  downloadFile: (bucket: string, filePath: string, tenantId: string) => Promise<Buffer>;
  analyzePdf: (buffer: Buffer, mimeType: string) => Promise<string>;
};

export type LoadedClaimAiInput = ClaimedClaimAiRun & {
  bucket: string;
  fileBuffer: Buffer;
  documentText: string;
  metrics: SanitizedContentMetrics;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getBucketFromRequestJson(requestJson: Record<string, unknown> | null | undefined) {
  const value = requestJson?.bucket;
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return resolveEvidenceBucketName();
}

function getClaimSnapshotFromRequestJson(
  requestJson: Record<string, unknown>
): { incidentDate: string | null } | null {
  const value = requestJson.claimSnapshot;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const incidentDateValue = (value as { incidentDate?: unknown }).incidentDate;
  const incidentDate = typeof incidentDateValue === 'string' ? incidentDateValue.trim() : '';

  return {
    incidentDate: ISO_DATE_PATTERN.test(incidentDate) ? incidentDate : null,
  };
}

export function validateClaimAiCandidate(
  workflow: ClaimedClaimAiRun['workflow'],
  candidate: unknown
) {
  return workflow === 'legal_doc_extract'
    ? validateExtractionCandidate(workflow, legalDocExtractSchema, candidate)
    : validateExtractionCandidate(workflow, claimIntakeExtractSchema, candidate);
}

export async function loadClaimAiInput(
  run: ClaimedClaimAiRun,
  deps: ClaimPipelineDeps
): Promise<LoadedClaimAiInput> {
  const requestJson = run.requestJson && typeof run.requestJson === 'object' ? run.requestJson : {};
  const bucket = getBucketFromRequestJson(requestJson);
  const fileBuffer = await deps.downloadFile(bucket, run.storagePath, run.tenantId);
  const documentText = await deps.analyzePdf(fileBuffer, run.mimeType);

  return {
    ...run,
    bucket,
    fileBuffer,
    documentText,
    metrics: buildSanitizedContentMetrics({ buffer: fileBuffer, parsedText: documentText }),
  };
}

export async function extractClaimAiCandidate(
  input: LoadedClaimAiInput
): Promise<ExtractionCandidate> {
  const requestJson =
    input.requestJson && typeof input.requestJson === 'object' ? input.requestJson : {};
  const aiCallContext = await readClaimPipelineAiCallContext(input);
  const candidate =
    input.workflow === 'legal_doc_extract'
      ? await extractLegalDocument({
          aiCallContext,
          documentText: input.documentText,
          fileName: input.fileName,
          uploadedAt: input.uploadedAt,
        })
      : await extractClaimIntake({
          aiCallContext,
          claim: {
            title: input.claimTitle,
            description: input.claimDescription,
            category: input.claimCategory,
            claimAmount: input.claimAmount,
            currency: input.claimCurrency,
          },
          claimSnapshot: getClaimSnapshotFromRequestJson(requestJson),
          documentText: input.documentText,
          uploadedAt: input.uploadedAt,
        });

  return {
    candidate,
    rawConfidence: readCandidateConfidence(candidate),
    warnings: readCandidateWarnings(candidate),
  };
}
