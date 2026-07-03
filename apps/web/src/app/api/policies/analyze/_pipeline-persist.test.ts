import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const txInsertOnConflictDoNothing = vi.fn();
  const txInsertValues = vi.fn(() => ({ onConflictDoNothing: txInsertOnConflictDoNothing }));
  const txExecute = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: vi.fn() }));
  const txUpdateReturning = vi.fn();
  const txUpdateWhere = vi.fn(() => ({ returning: txUpdateReturning }));
  const txUpdateSetWithReturning = vi.fn(() => ({ where: txUpdateWhere }));
  const tx = {
    execute: txExecute,
    insert: vi.fn(() => ({ values: txInsertValues })),
    update: vi.fn(() => ({ set: txUpdateSetWithReturning })),
  };

  return {
    nanoid: vi.fn(() => 'extraction-1'),
    tx,
    txExecute,
    txInsertOnConflictDoNothing,
    txInsertValues,
    txUpdateReturning,
    txUpdateSet,
    txUpdateSetWithReturning,
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
  documentExtractions: { __name: 'document_extractions', sourceRunId: {} },
  policies: { __name: 'policies', id: {} },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions, op: 'and' })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));
vi.mock('nanoid', () => ({ nanoid: mocks.nanoid }));

import { persistPolicyExtraction } from './_pipeline-persist';

const run = {
  runId: 'run-1',
  tenantId: 'tenant-1',
  documentId: 'doc-1',
  policyId: 'policy-1',
  storagePath: 'pii/tenants/tenant-1/policies/user/file.pdf',
  requestJson: {},
};

const extraction = {
  provider: 'Acme',
  policyNumber: 'POL-1',
  coverageAmount: 100,
  currency: 'EUR',
  deductible: 10,
  confidence: 0.83,
  warnings: ['Confirm deductible.'],
};

const critique = {
  decision: 'needs_human_review' as const,
  confidence: 0.83,
  warnings: ['Confirm deductible.'],
  warningCodes: ['extraction_warnings'],
  escalationRecommended: false,
  persistenceAllowed: true,
};

describe('persistPolicyExtraction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists schema-valid policy output with confidence and critique metadata', async () => {
    mocks.txExecute.mockResolvedValue([{ id: 'doc-1' }]);
    mocks.txUpdateReturning.mockResolvedValue([{ id: 'run-1' }]);

    await persistPolicyExtraction({
      run,
      extraction,
      critique,
    });

    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        confidence: '0.83',
        reviewStatus: 'pending',
        schemaVersion: 'policy_extract_v1',
        sourceRunId: 'run-1',
      })
    );
    expect(mocks.txUpdateSetWithReturning).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        responseJson: expect.objectContaining({
          critique: expect.objectContaining({ warningCodes: ['extraction_warnings'] }),
        }),
        status: 'completed',
      })
    );
  });

  it('fails and redacts the run when the source policy document was deleted', async () => {
    mocks.txExecute.mockResolvedValue([]);

    await expect(persistPolicyExtraction({ run, extraction, critique })).rejects.toMatchObject({
      errorCode: 'document_ai_document_deleted',
    });

    expect(mocks.tx.insert).not.toHaveBeenCalled();
    expect(mocks.txUpdateSetWithReturning).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'document_ai_document_deleted',
        requestJson: {},
        outputJson: null,
        responseJson: null,
      })
    );
  });

  it('does not write policy output when completion loses the processing lock', async () => {
    mocks.txExecute.mockResolvedValue([{ id: 'doc-1' }]);
    mocks.txUpdateReturning.mockResolvedValue([]);

    await expect(persistPolicyExtraction({ run, extraction, critique })).rejects.toMatchObject({
      errorCode: 'document_ai_document_deleted',
    });

    expect(mocks.tx.insert).not.toHaveBeenCalled();
    expect(mocks.tx.update).toHaveBeenCalledTimes(2);
    expect(mocks.tx.update).not.toHaveBeenCalledWith({ __name: 'policies', id: {} });
    expect(mocks.txUpdateSetWithReturning).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        requestJson: {},
        outputJson: null,
        responseJson: null,
      })
    );
  });
});
