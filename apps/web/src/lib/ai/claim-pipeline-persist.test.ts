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
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn((left: unknown, right: unknown) => ({ left, right })) }));
vi.mock('nanoid', () => ({ nanoid: mocks.nanoid }));

import { persistClaimAiExtraction } from './claim-pipeline-persist';

describe('persistClaimAiExtraction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists legal extraction output with confidence and critique metadata', async () => {
    await persistClaimAiExtraction({
      run: {
        runId: 'run-1',
        tenantId: 'tenant-1',
        workflow: 'legal_doc_extract',
        documentId: 'doc-1',
        claimId: 'claim-1',
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
