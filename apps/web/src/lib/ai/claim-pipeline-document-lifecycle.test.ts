import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const where = vi.fn();
  const select = vi.fn(() => ({ from: vi.fn(() => ({ innerJoin: vi.fn(() => ({ where })) })) }));
  const updateReturning = vi.fn();
  const updateWhere = vi.fn();
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  updateWhere.mockReturnValue({ returning: updateReturning });
  return {
    db: { select },
    update,
    updateReturning,
    updateSet,
    updateWhere,
    where,
    withTenantContext: vi.fn(async (_context: unknown, callback: (tx: unknown) => unknown) =>
      callback({ update })
    ),
  };
});

vi.mock('@/lib/db.server', () => ({ db: mocks.db }));
vi.mock('@interdomestik/database', () => ({ withTenantContext: mocks.withTenantContext }));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: {
    documentId: 'ai_runs.document_id',
    entityId: 'ai_runs.entity_id',
    entityType: 'ai_runs.entity_type',
    errorCode: 'ai_runs.error_code',
    id: 'ai_runs.id',
    outputJson: 'ai_runs.output_json',
    requestJson: 'ai_runs.request_json',
    responseJson: 'ai_runs.response_json',
    status: 'ai_runs.status',
    tenantId: 'ai_runs.tenant_id',
    workflow: 'ai_runs.workflow',
  },
  documents: {
    deletedAt: 'documents.deleted_at',
    id: 'documents.id',
    tenantId: 'documents.tenant_id',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
}));

import { failDeletedDocumentClaimAiRun } from './claim-pipeline-document-lifecycle';

function isWorkflow(workflow: unknown): workflow is 'claim_intake_extract' | 'legal_doc_extract' {
  return workflow === 'claim_intake_extract' || workflow === 'legal_doc_extract';
}

describe('failDeletedDocumentClaimAiRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateReturning.mockResolvedValue([{ id: 'run-1' }]);
  });

  it('marks queued AI runs for deleted documents failed and returns skipped', async () => {
    mocks.where.mockResolvedValue([
      {
        claimId: 'claim-1',
        deletedAt: new Date('2026-07-03T00:00:00Z'),
        errorCode: null,
        status: 'queued',
        tenantId: 'tenant-1',
        workflow: 'claim_intake_extract',
      },
    ]);

    await expect(failDeletedDocumentClaimAiRun('run-1', isWorkflow)).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', role: 'system' },
      expect.any(Function)
    );
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'claim_ai_document_deleted',
        completedAt: expect.any(Date),
        requestJson: {},
        outputJson: null,
        responseJson: null,
      })
    );
  });

  it('returns skipped for runs already failed by document deletion', async () => {
    mocks.where.mockResolvedValue([
      {
        claimId: 'claim-1',
        deletedAt: new Date('2026-07-03T00:00:00Z'),
        errorCode: 'claim_ai_document_deleted',
        status: 'failed',
        tenantId: 'tenant-1',
        workflow: 'claim_intake_extract',
      },
    ]);

    await expect(failDeletedDocumentClaimAiRun('run-1', isWorkflow)).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('terminalizes a retryable failure when its document was deleted before retry', async () => {
    mocks.where.mockResolvedValue([
      {
        claimId: 'claim-1',
        deletedAt: new Date('2026-07-03T00:00:00Z'),
        errorCode: 'claim_ai_processing_failed',
        status: 'failed',
        tenantId: 'tenant-1',
        workflow: 'claim_intake_extract',
      },
    ]);

    await expect(
      failDeletedDocumentClaimAiRun('run-1', isWorkflow, { retryFailed: true })
    ).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorCode: 'claim_ai_document_deleted' })
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

  it.each([
    ['without retry intent', 'failed', 'claim_ai_processing_failed', {}],
    ['while processing', 'processing', 'claim_ai_processing_failed', { retryFailed: true }],
    ['after completion', 'completed', null, { retryFailed: true }],
    [
      'for a permanent failure',
      'failed',
      'claim_intake_extract_validation_failed',
      { retryFailed: true },
    ],
  ])('does not overwrite deleted-document runs %s', async (_case, status, errorCode, options) => {
    mocks.where.mockResolvedValue([
      {
        claimId: 'claim-1',
        deletedAt: new Date('2026-07-03T00:00:00Z'),
        errorCode,
        status,
        tenantId: 'tenant-1',
        workflow: 'claim_intake_extract',
      },
    ]);

    await expect(failDeletedDocumentClaimAiRun('run-1', isWorkflow, options)).resolves.toBeNull();
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('does not return skipped when the failed-run update loses its optimistic lock', async () => {
    mocks.where.mockResolvedValue([
      {
        claimId: 'claim-1',
        deletedAt: new Date('2026-07-03T00:00:00Z'),
        errorCode: 'claim_ai_processing_failed',
        status: 'failed',
        tenantId: 'tenant-1',
        workflow: 'claim_intake_extract',
      },
    ]);
    mocks.updateReturning.mockResolvedValue([]);

    await expect(
      failDeletedDocumentClaimAiRun('run-1', isWorkflow, { retryFailed: true })
    ).resolves.toBeNull();
  });

  it('does not return skipped when the queued update loses its optimistic lock', async () => {
    mocks.where.mockResolvedValue([
      {
        claimId: 'claim-1',
        deletedAt: new Date('2026-07-03T00:00:00Z'),
        errorCode: null,
        status: 'queued',
        tenantId: 'tenant-1',
        workflow: 'claim_intake_extract',
      },
    ]);
    mocks.updateReturning.mockResolvedValue([]);

    await expect(failDeletedDocumentClaimAiRun('run-1', isWorkflow)).resolves.toBeNull();
  });
});
