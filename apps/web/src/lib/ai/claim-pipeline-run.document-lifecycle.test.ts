import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const where = vi.fn();
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const secondJoin = { where };
  const firstJoin = { innerJoin: vi.fn(() => secondJoin), where };
  const fromResult = { innerJoin: vi.fn(() => firstJoin) };
  const select = vi.fn(() => ({ from: vi.fn(() => fromResult) }));
  return {
    db: { select },
    failDeletedDocumentClaimAiRun: vi.fn(),
    firstInnerJoin: fromResult.innerJoin,
    isNull: vi.fn((field: unknown) => ({ op: 'isNull', field })),
    secondInnerJoin: firstJoin.innerJoin,
    update,
    updateReturning,
    updateSet,
    updateWhere,
    withTenantContext: vi.fn(
      async (_context: unknown, callback: (tx: { update: typeof update }) => unknown) =>
        callback({ update })
    ),
    where,
  };
});

vi.mock('@/lib/db.server', () => ({ db: mocks.db }));
vi.mock('@interdomestik/database', () => ({ withTenantContext: mocks.withTenantContext }));
vi.mock('./claim-pipeline-document-lifecycle', () => ({
  failDeletedDocumentClaimAiRun: mocks.failDeletedDocumentClaimAiRun,
}));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: {
    documentId: 'ai_runs.document_id',
    completedAt: 'ai_runs.completed_at',
    entityId: 'ai_runs.entity_id',
    entityType: 'ai_runs.entity_type',
    errorCode: 'ai_runs.error_code',
    id: 'ai_runs.id',
    requestedBy: 'ai_runs.requested_by',
    requestJson: 'ai_runs.request_json',
    status: 'ai_runs.status',
    tenantId: 'ai_runs.tenant_id',
    workflow: 'ai_runs.workflow',
  },
  claims: {
    category: 'claims.category',
    claimAmount: 'claims.claim_amount',
    currency: 'claims.currency',
    description: 'claims.description',
    id: 'claims.id',
    tenantId: 'claims.tenant_id',
    title: 'claims.title',
    userId: 'claims.user_id',
  },
  documents: {
    deletedAt: 'documents.deleted_at',
    fileName: 'documents.file_name',
    id: 'documents.id',
    mimeType: 'documents.mime_type',
    storagePath: 'documents.storage_path',
    tenantId: 'documents.tenant_id',
    uploadedAt: 'documents.uploaded_at',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  isNull: mocks.isNull,
}));

import { claimClaimAiRun } from './claim-pipeline-run';

const activeRun = (
  status: 'queued' | 'processing' | 'completed' | 'failed',
  errorCode: string | null = null
) => ({
  claimId: 'claim-1',
  documentId: 'doc-1',
  errorCode,
  requestedBy: 'user-1',
  status,
  subjectId: 'member-1',
  tenantId: 'tenant-1',
  workflow: 'claim_intake_extract',
});

describe('claimClaimAiRun document lifecycle guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.where.mockResolvedValue([]);
    mocks.failDeletedDocumentClaimAiRun.mockResolvedValue(null);
    mocks.updateReturning.mockResolvedValue([{ id: 'run-1' }]);
  });

  it('requires an active document row before claiming queued AI work', async () => {
    await expect(claimClaimAiRun('run-1')).rejects.toThrow(
      'Queued claim AI run run-1 was not found.'
    );

    expect(mocks.isNull).toHaveBeenCalledWith('documents.deleted_at');
    expect(mocks.firstInnerJoin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        args: expect.arrayContaining([
          expect.objectContaining({ field: 'documents.deleted_at', op: 'isNull' }),
        ]),
      })
    );
    expect(mocks.failDeletedDocumentClaimAiRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(Function),
      {}
    );
  });

  it('does not apply the deleted-document fallback to malformed active rows', async () => {
    mocks.where.mockResolvedValue([
      {
        claimId: 'claim-1',
        documentId: 'doc-1',
        requestedBy: 'user-1',
        status: 'queued',
        subjectId: null,
        workflow: 'claim_intake_extract',
      },
    ]);

    await expect(claimClaimAiRun('run-1')).rejects.toThrow(
      'Queued claim AI run run-1 was not found.'
    );
    expect(mocks.db.select).toHaveBeenCalledTimes(1);
    expect(mocks.failDeletedDocumentClaimAiRun).not.toHaveBeenCalled();
  });

  it('returns skipped when the deleted-document fallback claims the lifecycle case', async () => {
    mocks.failDeletedDocumentClaimAiRun.mockResolvedValue({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });

    await expect(claimClaimAiRun('run-1', { retryFailed: true })).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.failDeletedDocumentClaimAiRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(Function),
      { retryFailed: true }
    );
  });

  it('reclaims only an explicitly retried generic processing failure', async () => {
    mocks.where.mockResolvedValue([activeRun('failed', 'claim_ai_processing_failed')]);

    await expect(claimClaimAiRun('run-1', { retryFailed: true })).resolves.toMatchObject({
      status: 'claimed',
      run: { runId: 'run-1', claimId: 'claim-1' },
    });

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processing', completedAt: null, errorCode: null })
    );
    expect(mocks.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          { op: 'eq', left: 'ai_runs.status', right: 'failed' },
          { op: 'eq', left: 'ai_runs.error_code', right: 'claim_ai_processing_failed' },
        ]),
      })
    );
  });

  it('does not reclaim a generic failure without explicit retry intent', async () => {
    mocks.where.mockResolvedValue([activeRun('failed', 'claim_ai_processing_failed')]);

    await expect(claimClaimAiRun('run-1')).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it.each(['claim_intake_extract_validation_failed', 'claim_ai_document_deleted'])(
    'does not resurrect permanent failure %s on a retry attempt',
    async errorCode => {
      mocks.where.mockResolvedValue([activeRun('failed', errorCode)]);

      await expect(claimClaimAiRun('run-1', { retryFailed: true })).resolves.toEqual({
        status: 'skipped',
        claimId: 'claim-1',
        workflow: 'claim_intake_extract',
      });
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    }
  );

  it('does not reclaim completed work on a retry attempt', async () => {
    mocks.where.mockResolvedValue([activeRun('completed')]);

    await expect(claimClaimAiRun('run-1', { retryFailed: true })).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('returns skipped when another worker wins the failed-run reclaim race', async () => {
    mocks.where.mockResolvedValue([activeRun('failed', 'claim_ai_processing_failed')]);
    mocks.updateReturning.mockResolvedValue([]);

    await expect(claimClaimAiRun('run-1', { retryFailed: true })).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
  });
});
