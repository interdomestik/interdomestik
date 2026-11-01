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
    db: { select: vi.fn() },
    select,
    update,
    updateReturning,
    updateSet,
    updateWhere,
    where,
    withTenantContext: vi.fn(async (_context: unknown, callback: (tx: unknown) => unknown) =>
      callback({ select, update })
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
        tenantId: 'tenant_mk',
        workflow: 'claim_intake_extract',
      },
    ]);

    await expect(
      failDeletedDocumentClaimAiRun('run-1', isWorkflow, { tenantId: 'tenant_mk' })
    ).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_mk', role: 'system' },
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
        tenantId: 'tenant_mk',
        workflow: 'claim_intake_extract',
      },
    ]);

    await expect(
      failDeletedDocumentClaimAiRun('run-1', isWorkflow, { tenantId: 'tenant_mk' })
    ).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it('terminalizes a retryable failure when its document was deleted before retry', async () => {
    mocks.where.mockResolvedValue([
      {
        claimId: 'claim-1',
        deletedAt: new Date('2026-07-03T00:00:00Z'),
        errorCode: 'claim_ai_processing_failed',
        status: 'failed',
        tenantId: 'tenant_mk',
        workflow: 'claim_intake_extract',
      },
    ]);

    await expect(
      failDeletedDocumentClaimAiRun('run-1', isWorkflow, {
        tenantId: 'tenant_mk',
        retryFailed: true,
      })
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
    ['without retry intent', 'failed', 'claim_ai_processing_failed', { tenantId: 'tenant_mk' }],
    [
      'while processing',
      'processing',
      'claim_ai_processing_failed',
      { tenantId: 'tenant_mk', retryFailed: true },
    ],
    ['after completion', 'completed', null, { tenantId: 'tenant_mk', retryFailed: true }],
    [
      'for a permanent failure',
      'failed',
      'claim_intake_extract_validation_failed',
      { tenantId: 'tenant_mk', retryFailed: true },
    ],
  ])('does not overwrite deleted-document runs %s', async (_case, status, errorCode, options) => {
    mocks.where.mockResolvedValue([
      {
        claimId: 'claim-1',
        deletedAt: new Date('2026-07-03T00:00:00Z'),
        errorCode,
        status,
        tenantId: 'tenant_mk',
        workflow: 'claim_intake_extract',
      },
    ]);

    await expect(failDeletedDocumentClaimAiRun('run-1', isWorkflow, options)).resolves.toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it('does not return skipped when the failed-run update loses its optimistic lock', async () => {
    mocks.where.mockResolvedValue([
      {
        claimId: 'claim-1',
        deletedAt: new Date('2026-07-03T00:00:00Z'),
        errorCode: 'claim_ai_processing_failed',
        status: 'failed',
        tenantId: 'tenant_mk',
        workflow: 'claim_intake_extract',
      },
    ]);
    mocks.updateReturning.mockResolvedValue([]);

    await expect(
      failDeletedDocumentClaimAiRun('run-1', isWorkflow, {
        tenantId: 'tenant_mk',
        retryFailed: true,
      })
    ).resolves.toBeNull();
  });

  it('does not return skipped when the queued update loses its optimistic lock', async () => {
    mocks.where.mockResolvedValue([
      {
        claimId: 'claim-1',
        deletedAt: new Date('2026-07-03T00:00:00Z'),
        errorCode: null,
        status: 'queued',
        tenantId: 'tenant_mk',
        workflow: 'claim_intake_extract',
      },
    ]);
    mocks.updateReturning.mockResolvedValue([]);

    await expect(
      failDeletedDocumentClaimAiRun('run-1', isWorkflow, { tenantId: 'tenant_mk' })
    ).resolves.toBeNull();
  });

  it('looks the run up and fails it inside the event tenant context with tenant predicates', async () => {
    mocks.where.mockResolvedValue([
      {
        claimId: 'claim-1',
        deletedAt: new Date('2026-07-03T00:00:00Z'),
        errorCode: null,
        status: 'queued',
        tenantId: 'tenant_mk',
        workflow: 'claim_intake_extract',
      },
    ]);

    await failDeletedDocumentClaimAiRun('run-1', isWorkflow, { tenantId: 'tenant_mk' });

    expect(mocks.withTenantContext).toHaveBeenCalledTimes(2);
    for (const call of mocks.withTenantContext.mock.calls) {
      expect(call[0]).toEqual({ tenantId: 'tenant_mk', role: 'system' });
    }
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.where).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          { op: 'eq', left: 'ai_runs.id', right: 'run-1' },
          { op: 'eq', left: 'ai_runs.tenant_id', right: 'tenant_mk' },
        ]),
      })
    );
    expect(mocks.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          { op: 'eq', left: 'ai_runs.id', right: 'run-1' },
          { op: 'eq', left: 'ai_runs.tenant_id', right: 'tenant_mk' },
          { op: 'eq', left: 'ai_runs.status', right: 'queued' },
        ]),
      })
    );
  });

  it('returns null without updating when the run is not visible in the event tenant', async () => {
    mocks.where.mockResolvedValue([]);

    await expect(
      failDeletedDocumentClaimAiRun('run-1', isWorkflow, { tenantId: 'tenant_other' })
    ).resolves.toBeNull();

    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_other', role: 'system' },
      expect.any(Function)
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
