import { markAiRunDispatchFailedWithTenantContext } from '@/lib/ai/dispatch-failure';
import { downloadClaimAiFileWithRetry } from '@/lib/ai/claim-storage-download';
import { ExtractionPipelineError, critiqueExtraction } from '@/lib/ai/extraction-pipeline';
import { inngest } from '@/lib/inngest/client';
import { throwTransientRetryFailure, withTransientRetry } from '@/lib/reliability/transient-retry';

import {
  extractClaimAiCandidate,
  loadClaimAiInput,
  validateClaimAiCandidate,
  type ClaimPipelineDeps,
} from './claim-pipeline-input';
import { analyzeClaimDocumentAsText } from './claim-document-text';
import { markClaimAiRunFailed } from './claim-pipeline-failure';
import { persistClaimAiExtraction } from './claim-pipeline-persist';
import { claimClaimAiRun, type ClaimAiWorkflow } from './claim-pipeline-run';

type QueuedClaimAiRun = {
  runId: string;
  workflow: ClaimAiWorkflow;
  claimId: string;
  documentId: string;
};

type ProcessClaimDocumentWorkflowDeps = {
  downloadFile?: (bucket: string, filePath: string, tenantId: string) => Promise<Buffer>;
  analyzePdf?: ClaimPipelineDeps['analyzePdf'];
};

export class PersistedClaimAiRetryableError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Claim AI processing failed.');
    this.name = 'PersistedClaimAiRetryableError';
    this.cause = cause;
  }
}

function getEventName(workflow: ClaimAiWorkflow) {
  return workflow === 'legal_doc_extract'
    ? 'legal/extract.requested'
    : 'claim/intake-extract.requested';
}

async function downloadFileFromStorage(
  bucket: string,
  filePath: string,
  tenantId: string
): Promise<Buffer> {
  return downloadClaimAiFileWithRetry({ bucket, filePath, tenantId });
}

export async function emitClaimAiRunRequestedService(queuedRun: QueuedClaimAiRun) {
  const result = await withTransientRetry(
    () =>
      inngest.send({
        name: getEventName(queuedRun.workflow),
        data: queuedRun,
      }),
    { initialDelayMs: 200, maxDelayMs: 1_000, maxElapsedMs: 10_000 }
  );

  if (!result.ok) {
    throwTransientRetryFailure(result, 'Failed to dispatch claim AI run.');
  }
}

export async function markClaimAiRunDispatchFailedService(args: {
  runId: string;
  message: string;
}) {
  await markAiRunDispatchFailedWithTenantContext({
    entityType: 'claim',
    errorCode: 'claim_ai_dispatch_failed',
    message: args.message,
    runId: args.runId,
  });
}

export async function processClaimDocumentWorkflowRunService(args: {
  runId: string;
  retryFailed?: boolean;
  deps?: ProcessClaimDocumentWorkflowDeps;
}): Promise<{
  status: 'completed' | 'failed' | 'skipped';
  runId: string;
  claimId: string;
  workflow: ClaimAiWorkflow;
  extraction?: Record<string, unknown>;
}> {
  const downloadFile = args.deps?.downloadFile ?? downloadFileFromStorage;
  const analyzePdf = args.deps?.analyzePdf ?? analyzeClaimDocumentAsText;
  const deps = { downloadFile, analyzePdf };

  const claimed = await claimClaimAiRun(args.runId, { retryFailed: args.retryFailed === true });
  if (claimed.status === 'skipped') {
    return {
      status: 'skipped',
      runId: args.runId,
      claimId: claimed.claimId,
      workflow: claimed.workflow,
    };
  }

  try {
    const input = await loadClaimAiInput(claimed.run, deps);
    const candidate = await extractClaimAiCandidate(input);
    const extraction = validateClaimAiCandidate(claimed.run.workflow, candidate.candidate);
    const critique = critiqueExtraction({
      confidence: candidate.rawConfidence,
      warnings: candidate.warnings,
      metrics: input.metrics,
    });
    if (!critique.persistenceAllowed) {
      throw new ExtractionPipelineError(
        `${claimed.run.workflow}_critique_failed`,
        `${claimed.run.workflow} output failed critique.`
      );
    }

    await persistClaimAiExtraction({ run: claimed.run, extraction, critique });

    return {
      status: 'completed',
      runId: args.runId,
      claimId: claimed.run.claimId,
      workflow: claimed.run.workflow,
      extraction,
    };
  } catch (error) {
    const failure = await markClaimAiRunFailed({ run: claimed.run, error });
    if (error instanceof ExtractionPipelineError) {
      return {
        status: 'failed',
        runId: args.runId,
        claimId: claimed.run.claimId,
        workflow: claimed.run.workflow,
      };
    }
    if (failure.errorCode !== 'claim_ai_processing_failed') {
      return {
        status: 'failed',
        runId: args.runId,
        claimId: claimed.run.claimId,
        workflow: claimed.run.workflow,
      };
    }
    throw new PersistedClaimAiRetryableError(error);
  }
}
