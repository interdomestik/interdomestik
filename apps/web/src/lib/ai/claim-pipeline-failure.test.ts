import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return {
    returning,
    set,
    update,
    where,
    withTenantContext: vi.fn(
      async (_context: unknown, callback: (tx: { update: typeof update }) => unknown) =>
        callback({ update })
    ),
  };
});

vi.mock('@interdomestik/database', () => ({ withTenantContext: mocks.withTenantContext }));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: {
    completedAt: 'ai_runs.completed_at',
    errorCode: 'ai_runs.error_code',
    errorMessage: 'ai_runs.error_message',
    id: 'ai_runs.id',
    status: 'ai_runs.status',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
}));

import type { ClaimedClaimAiRun } from './claim-pipeline-run';
import { markClaimAiRunFailed } from './claim-pipeline-failure';

const run = {
  runId: 'run-1',
  tenantId: 'tenant-1',
  workflow: 'claim_intake_extract',
  documentId: 'doc-1',
  claimId: 'claim-1',
  requestedBy: 'user-1',
  subjectId: 'member-1',
  storagePath: 'path',
  fileName: 'file.pdf',
  mimeType: 'application/pdf',
  uploadedAt: new Date('2026-09-11T00:00:00.000Z'),
  requestJson: {},
  claimTitle: 'Claim',
  claimDescription: null,
  claimCategory: 'travel',
  claimAmount: null,
  claimCurrency: 'EUR',
} satisfies ClaimedClaimAiRun;

describe('markClaimAiRunFailed persistence receipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the generic error code read back from the updated row', async () => {
    mocks.returning.mockResolvedValue([{ id: 'run-1', errorCode: 'claim_ai_processing_failed' }]);

    await expect(markClaimAiRunFailed({ run, error: new Error('temporary') })).resolves.toEqual({
      errorCode: 'claim_ai_processing_failed',
    });
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', role: 'system' },
      expect.any(Function)
    );
    expect(mocks.where).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'and',
        args: expect.arrayContaining([
          { op: 'eq', left: 'ai_runs.id', right: 'run-1' },
          { op: 'eq', left: 'ai_runs.status', right: 'processing' },
        ]),
      })
    );
  });

  it('uses the returned non-generic database code instead of the input classification', async () => {
    const error = Object.assign(new Error('provider rejected input'), {
      errorCode: 'claim_ai_provider_rejected',
    });
    mocks.returning.mockResolvedValue([{ id: 'run-1', errorCode: 'claim_ai_document_deleted' }]);

    await expect(markClaimAiRunFailed({ run, error })).resolves.toEqual({
      errorCode: 'claim_ai_document_deleted',
    });
  });

  it('fails closed when no row was updated', async () => {
    mocks.returning.mockResolvedValue([]);

    await expect(markClaimAiRunFailed({ run, error: new Error('temporary') })).rejects.toThrow(
      'Claim AI failure for run run-1 was not persisted.'
    );
  });

  it('preserves a rejected failure write as an observable error', async () => {
    const failure = new Error('database unavailable');
    mocks.returning.mockRejectedValue(failure);

    await expect(markClaimAiRunFailed({ run, error: new Error('temporary') })).rejects.toBe(
      failure
    );
  });
});
