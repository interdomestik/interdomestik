import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const txInsertOnConflictDoNothing = vi.fn();
  const txInsertValues = vi.fn(() => ({ onConflictDoNothing: txInsertOnConflictDoNothing }));
  const txUpdateSet = vi.fn(() => ({ where: vi.fn() }));
  const tx = {
    insert: vi.fn(() => ({ values: txInsertValues })),
    update: vi.fn(() => ({ set: txUpdateSet })),
  };

  return {
    nanoid: vi.fn(() => 'extraction-1'),
    tx,
    txInsertOnConflictDoNothing,
    txInsertValues,
    txUpdateSet,
    withTenantContext: vi.fn(async (_context: unknown, callback: (txArg: typeof tx) => unknown) =>
      callback(tx)
    ),
  };
});

vi.mock('@interdomestik/database', () => ({ withTenantContext: mocks.withTenantContext }));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: { __name: 'ai_runs', id: {} },
  documentExtractions: { __name: 'document_extractions', sourceRunId: {} },
  policies: { __name: 'policies', id: {} },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn((left: unknown, right: unknown) => ({ left, right })) }));
vi.mock('nanoid', () => ({ nanoid: mocks.nanoid }));

import { persistPolicyExtraction } from './_pipeline-persist';

describe('persistPolicyExtraction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists schema-valid policy output with confidence and critique metadata', async () => {
    await persistPolicyExtraction({
      run: {
        runId: 'run-1',
        tenantId: 'tenant-1',
        documentId: 'doc-1',
        policyId: 'policy-1',
        storagePath: 'pii/tenants/tenant-1/policies/user/file.pdf',
        requestJson: {},
      },
      extraction: {
        provider: 'Acme',
        policyNumber: 'POL-1',
        coverageAmount: 100,
        currency: 'EUR',
        deductible: 10,
        confidence: 0.83,
        warnings: ['Confirm deductible.'],
      },
      critique: {
        decision: 'needs_human_review',
        confidence: 0.83,
        warnings: ['Confirm deductible.'],
        warningCodes: ['extraction_warnings'],
        escalationRecommended: false,
        persistenceAllowed: true,
      },
    });

    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        confidence: '0.83',
        reviewStatus: 'pending',
        schemaVersion: 'policy_extract_v1',
        sourceRunId: 'run-1',
      })
    );
    expect(mocks.txUpdateSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        responseJson: expect.objectContaining({
          critique: expect.objectContaining({ warningCodes: ['extraction_warnings'] }),
        }),
        status: 'completed',
      })
    );
  });
});
