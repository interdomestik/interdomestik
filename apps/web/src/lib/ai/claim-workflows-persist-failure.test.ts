import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const createFunction = vi.fn(
    (config: unknown, trigger: unknown, handler: (...args: unknown[]) => unknown) => ({
      config,
      handler,
      trigger,
    })
  );

  return {
    claimClaimAiRun: vi.fn(),
    createFunction,
    critiqueExtraction: vi.fn(),
    extractClaimAiCandidate: vi.fn(),
    loadClaimAiInput: vi.fn(),
    markClaimAiRunFailed: vi.fn(),
    persistClaimAiExtraction: vi.fn(),
    validateClaimAiCandidate: vi.fn(),
  };
});

vi.mock('@/lib/inngest/client', () => ({
  inngest: { createFunction: mocks.createFunction, send: vi.fn() },
}));
vi.mock('@interdomestik/domain-communications/cron-service', () => ({
  processAnnualReports: vi.fn(),
  processEmailSequences: vi.fn(),
  processSeasonalCampaigns: vi.fn(),
}));
vi.mock('@/app/api/policies/analyze/_services', () => ({
  processPolicyAnalysisRunService: vi.fn(),
}));
vi.mock('@/lib/reliability/transient-retry', () => ({
  throwTransientRetryFailure: vi.fn(),
  withTransientRetry: vi.fn(async (callback: () => unknown) => ({
    ok: true,
    value: await callback(),
  })),
}));
vi.mock('@/lib/ai/dispatch-failure', () => ({ markAiRunDispatchFailedWithTenantContext: vi.fn() }));
vi.mock('@/lib/ai/claim-storage-download', () => ({ downloadClaimAiFileWithRetry: vi.fn() }));
vi.mock('./claim-pipeline-run', () => ({ claimClaimAiRun: mocks.claimClaimAiRun }));
vi.mock('./claim-pipeline-input', () => ({
  extractClaimAiCandidate: mocks.extractClaimAiCandidate,
  loadClaimAiInput: mocks.loadClaimAiInput,
  validateClaimAiCandidate: mocks.validateClaimAiCandidate,
}));
vi.mock('./claim-pipeline-persist', () => ({
  persistClaimAiExtraction: mocks.persistClaimAiExtraction,
}));
vi.mock('./claim-pipeline-failure', () => ({ markClaimAiRunFailed: mocks.markClaimAiRunFailed }));
vi.mock('@/lib/ai/extraction-pipeline', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/ai/extraction-pipeline')>();
  return { ...actual, critiqueExtraction: mocks.critiqueExtraction };
});

import { ExtractionPipelineError } from '@/lib/ai/extraction-pipeline';

import { processClaimDocumentWorkflowRunService } from './claim-workflows';
import {
  claimIntakeExtractionRequested,
  legalDocumentExtractionRequested,
} from '@/lib/inngest/functions';

const run = {
  runId: 'run-1',
  tenantId: 'tenant-1',
  workflow: 'claim_intake_extract' as const,
  documentId: 'doc-1',
  claimId: 'claim-1',
  requestedBy: 'user-1',
  subjectId: 'member-1',
  storagePath: 'path',
  fileName: 'file.pdf',
  mimeType: 'application/pdf',
  uploadedAt: new Date('2026-03-08T10:00:00.000Z'),
  requestJson: {},
  claimTitle: 'Claim',
  claimDescription: null,
  claimCategory: 'travel',
  claimAmount: null,
  claimCurrency: 'EUR',
};

describe('processClaimDocumentWorkflowRunService persist failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimClaimAiRun.mockResolvedValue({ status: 'claimed', run });
    mocks.loadClaimAiInput.mockResolvedValue({ metrics: { hasText: true } });
    mocks.extractClaimAiCandidate.mockResolvedValue({
      candidate: {},
      rawConfidence: 0.8,
      warnings: [],
    });
    mocks.validateClaimAiCandidate.mockReturnValue({ summary: 'derived PII' });
    mocks.critiqueExtraction.mockReturnValue({
      decision: 'needs_human_review',
      confidence: 0.8,
      warnings: [],
      warningCodes: [],
      escalationRecommended: false,
      persistenceAllowed: true,
    });
  });

  it('returns failed when persistence rejects a deleted-document run', async () => {
    mocks.persistClaimAiExtraction.mockRejectedValue(
      new ExtractionPipelineError('claim_ai_document_deleted', 'Document was deleted.')
    );

    await expect(processClaimDocumentWorkflowRunService({ runId: 'run-1' })).resolves.toEqual({
      status: 'failed',
      runId: 'run-1',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.claimClaimAiRun).toHaveBeenCalledWith('run-1', { retryFailed: false });
    expect(mocks.markClaimAiRunFailed).toHaveBeenCalledWith({
      run,
      error: expect.objectContaining({ errorCode: 'claim_ai_document_deleted' }),
    });
  });

  it('rethrows a generic failure after persisting it and forwards explicit retry intent', async () => {
    const failure = new Error('Storage temporarily unavailable.');
    mocks.persistClaimAiExtraction.mockRejectedValue(failure);

    await expect(
      processClaimDocumentWorkflowRunService({ runId: 'run-1', retryFailed: true })
    ).rejects.toThrow('Storage temporarily unavailable.');

    expect(mocks.claimClaimAiRun).toHaveBeenCalledWith('run-1', { retryFailed: true });
    expect(mocks.markClaimAiRunFailed).toHaveBeenCalledWith({ run, error: failure });
  });

  it('binds both claim workflow handlers to exactly one trusted retry attempt', async () => {
    type ClaimHandler = (args: {
      event: { data: { runId: string } };
      step: { run: (name: string, callback: () => unknown) => unknown };
      attempt: number;
    }) => Promise<unknown>;
    const claimIntake = claimIntakeExtractionRequested as unknown as {
      config: { id: string; retries: number };
      handler: ClaimHandler;
    };
    const legalDocument = legalDocumentExtractionRequested as unknown as {
      config: { id: string; retries: number };
      handler: ClaimHandler;
    };
    const step = { run: vi.fn(async (_name: string, callback: () => unknown) => callback()) };
    mocks.claimClaimAiRun.mockResolvedValue({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });

    expect(claimIntake.config).toEqual({ id: 'claim-intake-extraction-requested', retries: 1 });
    expect(legalDocument.config).toEqual({ id: 'legal-document-extraction-requested', retries: 1 });

    for (const [handler, runId] of [
      [claimIntake.handler, 'run-intake'],
      [legalDocument.handler, 'run-legal'],
    ] as const) {
      for (const attempt of [0, 1, 2]) {
        mocks.claimClaimAiRun.mockClear();
        await handler({ event: { data: { runId } }, step, attempt });
        expect(mocks.claimClaimAiRun).toHaveBeenCalledWith(runId, {
          retryFailed: attempt === 1,
        });
      }
    }
  });
});
