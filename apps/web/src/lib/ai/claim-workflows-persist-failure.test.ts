import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimClaimAiRun: vi.fn(),
  critiqueExtraction: vi.fn(),
  extractClaimAiCandidate: vi.fn(),
  loadClaimAiInput: vi.fn(),
  markClaimAiRunFailed: vi.fn(),
  persistClaimAiExtraction: vi.fn(),
  validateClaimAiCandidate: vi.fn(),
}));

vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }));
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

  it('binds both claim workflows to exactly one trusted retry attempt', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/inngest/functions.ts'), 'utf8');

    expect(source.match(/retries: 1/g)).toHaveLength(2);
    expect(source.match(/retryFailed: attempt === 1/g)).toHaveLength(2);
  });
});
