import { beforeEach, describe, expect, it, vi } from 'vitest';

const schema = vi.hoisted(() => ({
  aiRuns: {
    id: { __name: 'ai_runs.id' },
    tenantId: { __name: 'ai_runs.tenant_id' },
  },
  documentExtractions: {
    tenantId: { __name: 'document_extractions.tenant_id' },
    sourceRunId: { __name: 'document_extractions.source_run_id' },
    reviewStatus: { __name: 'document_extractions.review_status' },
  },
  policies: {
    id: { __name: 'policies.id' },
    tenantId: { __name: 'policies.tenant_id' },
  },
}));

const hoisted = vi.hoisted(() => {
  const selectLimit = vi.fn();
  const selectWhere = vi.fn(() => ({
    limit: selectLimit,
  }));
  const selectLeftJoin = vi.fn(() => ({
    where: selectWhere,
  }));
  const selectFrom = vi.fn(() => ({
    leftJoin: selectLeftJoin,
  }));
  const select = vi.fn(() => ({
    from: selectFrom,
  }));

  const txUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const txUpdateSet = vi.fn(() => ({
    where: txUpdateWhere,
  }));
  const txUpdate = vi.fn(() => ({
    set: txUpdateSet,
  }));
  const transaction = vi.fn(
    async (callback: (tx: { update: typeof txUpdate }) => Promise<unknown>) =>
      callback({
        update: txUpdate,
      })
  );

  return {
    db: {
      select,
      transaction,
    },
    policyExtractSchema: {
      safeParse: vi.fn((value: unknown) => ({ success: true as const, data: value })),
    },
    selectLimit,
    txUpdate,
    txUpdateSet,
    txUpdateWhere,
  };
});

vi.mock('@/lib/db.server', () => ({
  db: hoisted.db,
}));

vi.mock('@interdomestik/database', () => ({
  and: vi.fn((...args: unknown[]) => ({ __op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ __op: 'eq', left, right })),
}));

vi.mock('@interdomestik/database/schema', () => schema);

vi.mock('@interdomestik/domain-ai', () => ({
  policyExtractSchema: hoisted.policyExtractSchema,
}));

import { submitAiReview } from './_core';

describe('submitAiReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.selectLimit.mockResolvedValue([
      {
        id: 'run-1',
        workflow: 'policy_extract',
        entityType: 'policy',
        entityId: 'policy-1',
        extractionReviewStatus: 'pending',
        extractionJson: null,
        extractionWarnings: [],
      },
    ]);
  });

  it('scopes extraction and policy updates by tenant during review submission', async () => {
    const correctedExtraction = {
      provider: 'Carrier Co',
      policyNumber: 'POL-123',
      coverageAmount: 5000,
      currency: 'EUR',
      deductible: 100,
      confidence: 0.92,
      warnings: ['Confirmed by reviewer'],
    };

    const result = await submitAiReview({
      runId: 'run-1',
      tenantId: 'tenant-1',
      reviewerId: 'staff-1',
      reviewerRole: 'staff',
      action: 'correct',
      correctedExtraction,
    });

    expect(result).toEqual({
      kind: 'ok',
      data: {
        id: 'run-1',
        reviewStatus: 'corrected',
      },
    });
    expect(hoisted.txUpdateWhere).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        __op: 'and',
        args: expect.arrayContaining([
          expect.objectContaining({ left: schema.aiRuns.id, right: 'run-1' }),
          expect.objectContaining({ left: schema.aiRuns.tenantId, right: 'tenant-1' }),
        ]),
      })
    );
    expect(hoisted.txUpdateWhere).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        __op: 'and',
        args: expect.arrayContaining([
          expect.objectContaining({
            left: schema.documentExtractions.sourceRunId,
            right: 'run-1',
          }),
          expect.objectContaining({
            left: schema.documentExtractions.reviewStatus,
            right: 'pending',
          }),
          expect.objectContaining({
            left: schema.documentExtractions.tenantId,
            right: 'tenant-1',
          }),
        ]),
      })
    );
    expect(hoisted.txUpdateWhere).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        __op: 'and',
        args: expect.arrayContaining([
          expect.objectContaining({ left: schema.policies.id, right: 'policy-1' }),
          expect.objectContaining({ left: schema.policies.tenantId, right: 'tenant-1' }),
        ]),
      })
    );
  });
});
