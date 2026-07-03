import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const selectWhere = vi.fn();
  const txDeleteWhere = vi.fn();
  const txInsertOnConflictDoNothing = vi.fn();
  const txInsertValues = vi.fn(() => ({ onConflictDoNothing: txInsertOnConflictDoNothing }));
  const txUpdateReturning = vi.fn();
  const txUpdateWhere = vi.fn(() => ({ returning: txUpdateReturning }));
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const tx = {
    delete: vi.fn(() => ({ where: txDeleteWhere })),
    insert: vi.fn(() => ({ values: txInsertValues })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: selectWhere })) })),
    update: vi.fn(() => ({ set: txUpdateSet })),
  };

  return {
    selectWhere,
    tx,
    txDeleteWhere,
    txUpdateReturning,
    txUpdateSet,
    withTenantContext: vi.fn(async (_context: unknown, callback: (txArg: typeof tx) => unknown) =>
      callback(tx)
    ),
  };
});

vi.mock('@interdomestik/database', () => ({ withTenantContext: mocks.withTenantContext }));
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
vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'extraction-1') }));

import { persistClaimAiExtraction } from './claim-pipeline-persist';

const run = {
  runId: 'run-1',
  tenantId: 'tenant-1',
  workflow: 'claim_intake_extract' as const,
  documentId: 'doc-1',
  claimId: 'claim-1',
  requestedBy: 'user-1',
  subjectId: 'member-1',
  storagePath: 'pii/tenants/tenant-1/claims/claim-1/evidence.pdf',
  fileName: 'evidence.pdf',
  mimeType: 'application/pdf',
  uploadedAt: new Date('2026-03-08T10:00:00.000Z'),
  requestJson: {},
  claimTitle: 'Claim',
  claimDescription: null,
  claimCategory: 'travel',
  claimAmount: null,
  claimCurrency: 'EUR',
};

const critique = {
  decision: 'needs_human_review' as const,
  confidence: 0.74,
  warnings: [],
  warningCodes: [],
  escalationRecommended: false,
  persistenceAllowed: true,
};

describe('persistClaimAiExtraction lifecycle guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectWhere.mockResolvedValue([{ id: 'doc-1' }]);
    mocks.txUpdateReturning.mockResolvedValue([{ id: 'run-1' }]);
  });

  it('fails and redacts the run when the document was already deleted', async () => {
    mocks.selectWhere.mockResolvedValue([]);

    await expect(
      persistClaimAiExtraction({ run, extraction: { summary: 'derived PII' }, critique })
    ).rejects.toMatchObject({ errorCode: 'claim_ai_document_deleted' });

    expect(mocks.tx.insert).not.toHaveBeenCalled();
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'claim_ai_document_deleted',
        requestJson: {},
        outputJson: null,
        responseJson: null,
      })
    );
  });

  it('deletes inserted extraction output when completion loses the processing lock', async () => {
    mocks.txUpdateReturning.mockResolvedValue([]);

    await expect(
      persistClaimAiExtraction({ run, extraction: { summary: 'derived PII' }, critique })
    ).rejects.toMatchObject({ errorCode: 'claim_ai_document_deleted' });

    expect(mocks.tx.insert).toHaveBeenCalled();
    expect(mocks.tx.delete).toHaveBeenCalledWith(
      expect.objectContaining({ __name: 'document_extractions' })
    );
    expect(mocks.txDeleteWhere).toHaveBeenCalledWith(expect.objectContaining({ op: 'and' }));
    expect(mocks.txUpdateSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        requestJson: {},
        outputJson: null,
        responseJson: null,
      })
    );
  });
});
