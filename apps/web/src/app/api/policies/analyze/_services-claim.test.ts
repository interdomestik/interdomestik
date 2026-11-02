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
    nanoid: vi.fn(),
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

import { processPolicyAnalysisRunService } from './_services';

describe('processPolicyAnalysisRunService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nanoid.mockReturnValueOnce('extraction-1');
    mocks.selectWhere.mockResolvedValue([
      {
        runId: 'run-1',
        tenantId: 'tenant-1',
        documentId: 'document-1',
        policyId: 'policy-1',
        storagePath: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
        requestJson: {
          fileName: 'file.pdf',
          mimeType: 'application/pdf',
        },
        status: 'queued',
      },
    ]);
    mocks.updateReturning.mockResolvedValue([{ id: 'run-1' }]);
    mocks.txUpdateReturning.mockResolvedValue([{ id: 'run-1' }]);
    mocks.txExecute.mockResolvedValue([{ id: 'document-1' }]);
    mocks.txInsertValues.mockImplementation(() => ({
      onConflictDoNothing: mocks.txInsertOnConflictDoNothing,
      returning: mocks.txInsertReturning,
    }));
  });

  it('skips when another worker already claimed the queued run', async () => {
    mocks.txUpdateReturning.mockResolvedValueOnce([]);

    const result = await processPolicyAnalysisRunService({
      runId: 'run-1',
      tenantId: 'tenant-1',
      deps: {
        downloadFile: vi.fn(),
        analyzeImage: vi.fn(),
        analyzePdf: vi.fn(),
        analyzeText: vi.fn(),
      },
    });

    expect(result).toEqual({
      status: 'skipped',
      runId: 'run-1',
      policyId: 'policy-1',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('binds the run lookup and claim update to the event tenant', async () => {
    await processPolicyAnalysisRunService({
      runId: 'run-1',
      tenantId: 'tenant-1',
      deps: {
        downloadFile: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
        analyzeImage: vi.fn(),
        analyzePdf: vi
          .fn()
          .mockResolvedValue(
            'Valid text content from PDF that is definitely longer than fifty characters.'
          ),
        analyzeText: vi.fn().mockResolvedValue({
          provider: 'Acme Insurance',
          policyNumber: 'POL-123',
          coverageAmount: 100000,
          currency: 'EUR',
          deductible: 500,
          confidence: 0.83,
          warnings: [],
          hiddenPerks: [],
          summary: 'Extracted in background.',
        }),
      },
    });

    const tenantPredicate = {
      __op: 'eq',
      left: { __name: 'ai_runs.tenant_id' },
      right: 'tenant-1',
    };
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toEqual({
      tenantId: 'tenant-1',
      role: 'system',
    });
    expect(mocks.selectWhere.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ args: expect.arrayContaining([tenantPredicate]) })
    );
    expect(mocks.withTenantContext.mock.calls[1]?.[0]).toEqual({
      tenantId: 'tenant-1',
      role: 'system',
    });
    expect(mocks.txUpdateWhere.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ args: expect.arrayContaining([tenantPredicate]) })
    );
  });

  it('does not update a run that is not visible in the event tenant', async () => {
    // Both tenant-scoped lookups (active join and deleted-document fallback) find nothing.
    mocks.selectWhere.mockResolvedValue([]);

    await expect(
      processPolicyAnalysisRunService({
        runId: 'run-1',
        tenantId: 'tenant-other',
        deps: {
          downloadFile: vi.fn(),
          analyzeImage: vi.fn(),
          analyzePdf: vi.fn(),
          analyzeText: vi.fn(),
        },
      })
    ).rejects.toThrow('Queued policy analysis run run-1 was not found.');

    expect(mocks.withTenantContext).toHaveBeenCalledTimes(2);
    for (const call of mocks.withTenantContext.mock.calls) {
      expect(call[0]).toEqual({ tenantId: 'tenant-other', role: 'system' });
    }
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });
});
