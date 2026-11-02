import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const txInsertOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const txInsertValues = vi.fn();
  const txInsertReturning = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txUpdateReturning = vi.fn();
  const txUpdateWhere = vi.fn((..._predicate: unknown[]) => ({
    returning: txUpdateReturning,
  }));
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const txExecute = vi.fn();
  type Tx = {
    execute: typeof txExecute;
    insert: typeof txInsert;
    select: typeof select;
    update: typeof txUpdate;
  };
  const transaction = vi.fn(async (callback: (tx: Tx) => Promise<unknown>) =>
    callback({ execute: txExecute, insert: txInsert, select, update: txUpdate })
  );

  const selectWhere = vi.fn();
  const selectInnerJoin = vi.fn(() => ({ where: selectWhere }));
  const selectFrom = vi.fn(() => ({ innerJoin: selectInnerJoin, where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  return {
    createAdminClient: vi.fn(),
    db: {
      select,
      transaction,
      update,
    },
    nanoid: vi
      .fn()
      .mockReturnValueOnce('policy-1')
      .mockReturnValueOnce('document-1')
      .mockReturnValueOnce('run-1')
      .mockReturnValueOnce('extraction-1'),
    select,
    selectFrom,
    selectInnerJoin,
    selectWhere,
    transaction,
    txInsert,
    txInsertOnConflictDoNothing,
    txInsertReturning,
    txInsertValues,
    txExecute,
    txUpdate,
    txUpdateReturning,
    txUpdateSet,
    txUpdateWhere,
    updateReturning,
    withTenantContext: vi.fn(
      async (
        _context: { tenantId: string; role?: string },
        callback: (tx: Tx) => Promise<unknown>
      ) => callback({ execute: txExecute, insert: txInsert, select, update: txUpdate })
    ),
  };
});

vi.mock('@/lib/db.server', () => ({
  db: mocks.db,
}));

vi.mock('@interdomestik/database', () => ({
  createAdminClient: mocks.createAdminClient,
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: {
    __name: 'ai_runs',
    errorCode: {},
    id: {},
    status: {},
    tenantId: { __name: 'ai_runs.tenant_id' },
  },
  documentExtractions: {
    __name: 'document_extractions',
    sourceRunId: { __name: 'document_extractions.source_run_id' },
  },
  documents: {
    __name: 'documents',
    deletedAt: { __name: 'documents.deleted_at' },
    id: { __name: 'documents.id' },
    tenantId: { __name: 'documents.tenant_id' },
  },
  policies: { __name: 'policies' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ __op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ __op: 'eq', left, right })),
  isNull: vi.fn((field: unknown) => ({ __op: 'isNull', field })),
}));

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));

import { queuePolicyAnalysisService } from './_services';

describe('queuePolicyAnalysisService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nanoid
      .mockReturnValueOnce('policy-1')
      .mockReturnValueOnce('document-1')
      .mockReturnValueOnce('run-1')
      .mockReturnValueOnce('extraction-1');
    mocks.txInsertValues.mockImplementation(() => ({
      onConflictDoNothing: mocks.txInsertOnConflictDoNothing,
      returning: mocks.txInsertReturning,
    }));
    mocks.txInsertReturning.mockResolvedValue([{ id: 'policy-1' }]);
    mocks.txInsertOnConflictDoNothing.mockResolvedValue(undefined);
    mocks.txUpdateReturning.mockResolvedValue([{ id: 'run-1' }]);
    mocks.txExecute.mockResolvedValue([{ id: 'document-1' }]);
  });

  it('persists a placeholder policy, document, and queued ai run in one transaction', async () => {
    const result = await queuePolicyAnalysisService({
      tenantId: 'tenant-1',
      userId: 'user-1',
      fileUrl: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
      fileName: 'file.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
    });

    expect(result).toEqual({ policyId: 'policy-1', runId: 'run-1' });
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', role: 'system' },
      expect.any(Function)
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.txInsert).toHaveBeenCalledTimes(3);

    expect(mocks.txInsert).toHaveBeenNthCalledWith(1, { __name: 'policies' });
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'policy-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        provider: null,
        policyNumber: null,
        analysisJson: {},
        fileUrl: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
      })
    );
    expect(mocks.txInsertReturning).toHaveBeenCalledOnce();

    expect(mocks.txInsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ __name: 'documents' })
    );
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'document-1',
        tenantId: 'tenant-1',
        entityType: 'policy',
        entityId: 'policy-1',
        fileName: 'file.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        storagePath: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
        category: 'contract',
        uploadedBy: 'user-1',
        uploadedAt: expect.any(Date),
      })
    );

    expect(mocks.txInsert).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ __name: 'ai_runs' })
    );
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        id: 'run-1',
        tenantId: 'tenant-1',
        workflow: 'policy_extract',
        status: 'queued',
        documentId: 'document-1',
        entityType: 'policy',
        entityId: 'policy-1',
        requestedBy: 'user-1',
        model: 'gpt-5.5',
        modelSnapshot: 'gpt-5.5',
        promptVersion: 'policy_extract_v1',
        requestJson: {
          fileName: 'file.pdf',
          fileSize: 2048,
          fileUrl: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
          mimeType: 'application/pdf',
          promptCacheKey: 'interdomestik:policy_extract:gpt-5.5:policy_extract_v1',
        },
        reviewStatus: 'pending',
        createdAt: expect.any(Date),
      })
    );
    expect(
      (mocks.txInsertValues as unknown as { mock: { calls: unknown[][] } }).mock.calls[2]?.[0]
    ).toEqual(expect.objectContaining({ inputHash: expect.any(String) }));
  });
});
