import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const select = vi.fn();
  const from = vi.fn();
  const leftJoin = vi.fn();
  const where = vi.fn();
  const limit = vi.fn();
  const and = vi.fn((...args: unknown[]) => ({ op: 'and', args }));
  const eq = vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right }));
  const withTenant = vi.fn((_tenantId: string, _column: unknown, condition: unknown) => condition);

  return {
    and,
    db: {
      select,
    },
    eq,
    from,
    leftJoin,
    limit,
    where,
    withTenant,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  db: hoisted.db,
  eq: hoisted.eq,
}));

vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: {
    id: 'ai_runs.id',
    tenantId: 'ai_runs.tenant_id',
    workflow: 'ai_runs.workflow',
    status: 'ai_runs.status',
    documentId: 'ai_runs.document_id',
    entityType: 'ai_runs.entity_type',
    entityId: 'ai_runs.entity_id',
    requestedBy: 'ai_runs.requested_by',
    reviewStatus: 'ai_runs.review_status',
    errorCode: 'ai_runs.error_code',
    errorMessage: 'ai_runs.error_message',
    startedAt: 'ai_runs.started_at',
    completedAt: 'ai_runs.completed_at',
    createdAt: 'ai_runs.created_at',
  },
  documentExtractions: {
    sourceRunId: 'document_extractions.source_run_id',
    extractedJson: 'document_extractions.extracted_json',
    reviewStatus: 'document_extractions.review_status',
    warnings: 'document_extractions.warnings',
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: hoisted.withTenant,
}));

let getAiRun: typeof import('./get-run').getAiRun;

describe('getAiRun', () => {
  beforeAll(async () => {
    ({ getAiRun } = await import('./get-run'));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.db.select.mockReturnValue({ from: hoisted.from });
    hoisted.from.mockReturnValue({ leftJoin: hoisted.leftJoin });
    hoisted.leftJoin.mockReturnValue({ where: hoisted.where });
    hoisted.where.mockReturnValue({ limit: hoisted.limit });
  });

  it('returns a tenant-scoped run with extraction state and warnings', async () => {
    hoisted.limit.mockResolvedValue([
      {
        id: 'run-1',
        workflow: 'policy_extract',
        status: 'completed',
        documentId: 'document-1',
        entityType: 'policy',
        entityId: 'policy-1',
        requestedBy: 'member-1',
        runReviewStatus: 'pending',
        extractionReviewStatus: 'pending',
        errorCode: null,
        errorMessage: null,
        warnings: ['Confirm deductible'],
        extraction: {
          provider: 'Carrier Co',
          policyNumber: 'POL-123',
        },
        createdAt: new Date('2026-03-08T12:00:00.000Z'),
        startedAt: new Date('2026-03-08T12:01:00.000Z'),
        completedAt: new Date('2026-03-08T12:02:00.000Z'),
      },
    ]);

    const result = await getAiRun({
      tenantId: 'tenant-1',
      runId: 'run-1',
    });

    expect(result).toEqual({
      id: 'run-1',
      workflow: 'policy_extract',
      status: 'completed',
      workflowState: 'needs_review',
      documentId: 'document-1',
      entityType: 'policy',
      entityId: 'policy-1',
      requestedBy: 'member-1',
      reviewStatus: 'pending',
      errorCode: null,
      errorMessage: null,
      warnings: ['Confirm deductible'],
      extraction: {
        provider: 'Carrier Co',
        policyNumber: 'POL-123',
      },
      createdAt: '2026-03-08T12:00:00.000Z',
      startedAt: '2026-03-08T12:01:00.000Z',
      completedAt: '2026-03-08T12:02:00.000Z',
    });
  });
});
