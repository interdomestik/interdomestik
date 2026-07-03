import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const selectWhere = vi.fn();
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const txDeleteWhere = vi.fn();
  const txDelete = vi.fn(() => ({ where: txDeleteWhere }));
  const txExecute = vi.fn();
  const txInsertOnConflictDoNothing = vi.fn();
  const txInsertValues = vi.fn(() => ({ onConflictDoNothing: txInsertOnConflictDoNothing }));
  const txUpdateReturning = vi.fn();
  const txUpdateWhere = vi.fn(() => ({ returning: txUpdateReturning }));
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const tx = {
    delete: txDelete,
    execute: txExecute,
    insert: vi.fn(() => ({ values: txInsertValues })),
    select,
    update: vi.fn(() => ({ set: txUpdateSet })),
  };

  return {
    nanoid: vi.fn(() => 'extraction-1'),
    selectWhere,
    tx,
    txDeleteWhere,
    txExecute,
    txInsertValues,
    txUpdateReturning,
    txUpdateSet,
    txUpdateWhere,
    withTenantContext: vi.fn(async (_context: unknown, callback: (txArg: typeof tx) => unknown) =>
      callback(tx)
    ),
  };
});

vi.mock('@interdomestik/database', () => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  withTenantContext: mocks.withTenantContext,
}));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: { __name: 'ai_runs', id: {}, status: 'ai_runs.status' },
  documentExtractions: {
    __name: 'document_extractions',
    sourceRunId: 'document_extractions.source_run_id',
    tenantId: 'document_extractions.tenant_id',
  },
  documents: {
    deletedAt: 'documents.deleted_at',
    id: 'documents.id',
    tenantId: 'documents.tenant_id',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ args, op: 'and' })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right, op: 'eq' })),
  isNull: vi.fn((field: unknown) => ({ field, op: 'isNull' })),
}));
vi.mock('nanoid', () => ({ nanoid: mocks.nanoid }));

import { persistClaimAiExtraction } from './claim-pipeline-persist';

describe('persistClaimAiExtraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.txExecute.mockResolvedValue([{ id: 'doc-1' }]);
    mocks.selectWhere.mockResolvedValue([{ id: 'doc-1' }]);
    mocks.txUpdateReturning.mockResolvedValue([{ id: 'run-1' }]);
  });

  it('persists legal extraction output with confidence and critique metadata', async () => {
    await persistClaimAiExtraction({
      run: {
        runId: 'run-1',
        tenantId: 'tenant-1',
        workflow: 'legal_doc_extract',
        documentId: 'doc-1',
        claimId: 'claim-1',
        requestedBy: 'user-1',
        subjectId: 'member-1',
        storagePath: 'pii/tenants/tenant-1/claims/claim-1/legal.pdf',
        fileName: 'legal.pdf',
        mimeType: 'application/pdf',
        uploadedAt: new Date('2026-03-08T10:00:00.000Z'),
        requestJson: {},
        claimTitle: 'Claim',
        claimDescription: null,
        claimCategory: 'travel',
        claimAmount: null,
        claimCurrency: 'EUR',
      },
      extraction: { documentType: 'demand_letter', confidence: 0.74, warnings: [] },
      critique: {
        decision: 'needs_human_review',
        confidence: 0.74,
        warnings: [],
        warningCodes: ['low_confidence'],
        escalationRecommended: false,
        persistenceAllowed: true,
      },
    });

    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        confidence: '0.74',
        reviewStatus: 'pending',
        schemaVersion: 'legal_doc_extract_v1',
        sourceRunId: 'run-1',
      })
    );
    expect(mocks.txUpdateSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        responseJson: expect.objectContaining({
          event: 'legal/extract.requested',
          critique: expect.objectContaining({ warningCodes: ['low_confidence'] }),
        }),
        status: 'completed',
      })
    );
  });
});
