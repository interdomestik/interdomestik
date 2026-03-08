import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const txInsertOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const txInsertValues = vi.fn();
  const txInsertReturning = vi.fn();
  const txInsert = vi.fn(() => ({
    values: txInsertValues,
  }));
  const txUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const txUpdateSet = vi.fn(() => ({
    where: txUpdateWhere,
  }));
  const txUpdate = vi.fn(() => ({
    set: txUpdateSet,
  }));
  const transaction = vi.fn(
    async (
      callback: (tx: { insert: typeof txInsert; update: typeof txUpdate }) => Promise<unknown>
    ) =>
      callback({
        insert: txInsert,
        update: txUpdate,
      })
  );

  const selectWhere = vi.fn();
  const selectInnerJoin = vi.fn(() => ({
    where: selectWhere,
  }));
  const selectFrom = vi.fn(() => ({
    innerJoin: selectInnerJoin,
    where: selectWhere,
  }));
  const select = vi.fn(() => ({
    from: selectFrom,
  }));
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({
    returning: updateReturning,
  }));
  const updateSet = vi.fn(() => ({
    where: updateWhere,
  }));
  const update = vi.fn(() => ({
    set: updateSet,
  }));

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
    txUpdate,
    txUpdateSet,
    txUpdateWhere,
    update,
    updateReturning,
    updateSet,
    updateWhere,
  };
});

vi.mock('@/lib/db.server', () => ({
  db: mocks.db,
}));

vi.mock('@interdomestik/database', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: { __name: 'ai_runs' },
  documentExtractions: {
    __name: 'document_extractions',
    sourceRunId: { __name: 'document_extractions.source_run_id' },
  },
  documents: { __name: 'documents', id: { __name: 'documents.id' } },
  policies: { __name: 'policies' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ __op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ __op: 'eq', left, right })),
}));

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));

import { processPolicyAnalysisRunService, queuePolicyAnalysisService } from './_services';

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
    expect(mocks.transaction).toHaveBeenCalledOnce();
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

    expect(mocks.txInsert).toHaveBeenNthCalledWith(3, { __name: 'ai_runs' });
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
        model: 'gpt-5.4',
        modelSnapshot: 'gpt-5.4',
        promptVersion: 'policy_extract_v1',
        requestJson: {
          fileName: 'file.pdf',
          fileSize: 2048,
          fileUrl: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
          mimeType: 'application/pdf',
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
    mocks.txInsertValues.mockImplementation(() => ({
      onConflictDoNothing: mocks.txInsertOnConflictDoNothing,
      returning: mocks.txInsertReturning,
    }));
  });

  it('completes a queued run and persists the extraction in the background path', async () => {
    const analysis = {
      provider: 'Acme Insurance',
      policyNumber: 'POL-123',
      coverageAmount: '100000',
      currency: 'EUR',
      deductible: '500',
      hiddenPerks: [],
      summary: 'Extracted in background.',
    };

    const result = await processPolicyAnalysisRunService({
      runId: 'run-1',
      deps: {
        downloadFile: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
        analyzeImage: vi.fn(),
        analyzePdf: vi
          .fn()
          .mockResolvedValue(
            'Valid text content from PDF that is definitely longer than fifty characters.'
          ),
        analyzeText: vi.fn().mockResolvedValue(analysis),
      },
    });

    expect(result).toEqual({
      status: 'completed',
      runId: 'run-1',
      policyId: 'policy-1',
      analysis,
    });
    expect(mocks.update).toHaveBeenCalledWith({ __name: 'ai_runs' });
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'processing',
        startedAt: expect.any(Date),
      })
    );
    expect(mocks.updateReturning).toHaveBeenCalledWith({ id: undefined });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.txUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.txUpdate).toHaveBeenNthCalledWith(1, { __name: 'policies' });
    expect(mocks.txUpdateSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        provider: 'Acme Insurance',
        policyNumber: 'POL-123',
        analysisJson: analysis,
      })
    );
    expect(mocks.txInsert).toHaveBeenCalledWith(
      expect.objectContaining({ __name: 'document_extractions' })
    );
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'extraction-1',
        tenantId: 'tenant-1',
        documentId: 'document-1',
        entityType: 'policy',
        entityId: 'policy-1',
        workflow: 'policy_extract',
        schemaVersion: 'policy_extract_v1',
        extractedJson: analysis,
        warnings: [],
        sourceRunId: 'run-1',
        reviewStatus: 'pending',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
    );
    expect(mocks.txInsertOnConflictDoNothing).toHaveBeenCalledWith({
      target: { __name: 'document_extractions.source_run_id' },
    });
    expect(mocks.txUpdate).toHaveBeenNthCalledWith(2, { __name: 'ai_runs' });
    expect(mocks.txUpdateSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'completed',
        outputJson: analysis,
        completedAt: expect.any(Date),
      })
    );
  });

  it('skips when another worker already claimed the queued run', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);

    const result = await processPolicyAnalysisRunService({
      runId: 'run-1',
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
});
