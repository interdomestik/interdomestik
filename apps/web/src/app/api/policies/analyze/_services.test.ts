import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const txInsertValues = vi.fn();
  const txInsertReturning = vi.fn();
  const txInsert = vi.fn(() => ({
    values: txInsertValues,
  }));
  const transaction = vi.fn(async (callback: (tx: { insert: typeof txInsert }) => unknown) =>
    callback({ insert: txInsert })
  );

  return {
    createAdminClient: vi.fn(),
    db: { transaction },
    nanoid: vi
      .fn()
      .mockReturnValueOnce('policy-1')
      .mockReturnValueOnce('document-1')
      .mockReturnValueOnce('run-1')
      .mockReturnValueOnce('extraction-1'),
    policiesInsertResult: [{ id: 'policy-1' }],
    transaction,
    txInsert,
    txInsertReturning,
    txInsertValues,
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
  documentExtractions: { __name: 'document_extractions' },
  documents: { __name: 'documents' },
  policies: { __name: 'policies' },
}));

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));

import { savePolicyService } from './_services';

describe('savePolicyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nanoid
      .mockReturnValueOnce('policy-1')
      .mockReturnValueOnce('document-1')
      .mockReturnValueOnce('run-1')
      .mockReturnValueOnce('extraction-1');
    mocks.txInsertValues.mockImplementation(() => ({
      returning: mocks.txInsertReturning,
    }));
    mocks.txInsertReturning.mockResolvedValue(mocks.policiesInsertResult);
  });

  it('persists policy, document, run, and extraction records in one transaction', async () => {
    const analysisJson = {
      provider: 'Acme Insurance',
      policyNumber: 'POL-123',
    };

    const result = await savePolicyService({
      tenantId: 'tenant-1',
      userId: 'user-1',
      provider: 'Acme Insurance',
      policyNumber: 'POL-123',
      analysisJson,
      fileUrl: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
      fileName: 'file.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
    });

    expect(result).toEqual({ id: 'policy-1' });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.txInsert).toHaveBeenCalledTimes(4);

    expect(mocks.txInsert).toHaveBeenNthCalledWith(1, { __name: 'policies' });
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'policy-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        provider: 'Acme Insurance',
        policyNumber: 'POL-123',
        analysisJson,
        fileUrl: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
      })
    );
    expect(mocks.txInsertReturning).toHaveBeenCalledOnce();

    expect(mocks.txInsert).toHaveBeenNthCalledWith(2, { __name: 'documents' });
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
        workflow: 'policy_analysis_sync',
        status: 'completed',
        documentId: 'document-1',
        entityType: 'policy',
        entityId: 'policy-1',
        requestedBy: 'user-1',
        model: 'legacy-policy-analyzer',
        modelSnapshot: 'legacy-policy-analyzer',
        promptVersion: 'legacy_policy_analysis_sync_v1',
        requestJson: {
          fileName: 'file.pdf',
          fileSize: 2048,
          fileUrl: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
          mimeType: 'application/pdf',
        },
        outputJson: analysisJson,
        reviewStatus: 'not_requested',
        startedAt: expect.any(Date),
        completedAt: expect.any(Date),
        createdAt: expect.any(Date),
      })
    );
    expect(
      (mocks.txInsertValues as unknown as { mock: { calls: unknown[][] } }).mock.calls[2]?.[0]
    ).toEqual(expect.objectContaining({ inputHash: expect.any(String) }));

    expect(mocks.txInsert).toHaveBeenNthCalledWith(4, { __name: 'document_extractions' });
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        id: 'extraction-1',
        tenantId: 'tenant-1',
        documentId: 'document-1',
        entityType: 'policy',
        entityId: 'policy-1',
        workflow: 'policy_analysis_sync',
        schemaVersion: 'policy_extract_v1',
        extractedJson: analysisJson,
        warnings: [],
        sourceRunId: 'run-1',
        reviewStatus: 'not_requested',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
    );
  });
});
