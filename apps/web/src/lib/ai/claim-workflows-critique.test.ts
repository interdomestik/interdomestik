import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const txInsert = vi.fn(() => ({ values: vi.fn() }));
  const txUpdateReturning = vi.fn().mockResolvedValue([{ id: 'run-1' }]);
  const txUpdateSet = vi.fn(() => ({ where: vi.fn(() => ({ returning: txUpdateReturning })) }));
  const selectWhere = vi.fn();
  const secondJoin = { where: selectWhere };
  const firstJoin = { innerJoin: vi.fn(() => secondJoin), where: selectWhere };
  const fromResult = { innerJoin: vi.fn(() => firstJoin) };
  const from = vi.fn(() => fromResult);
  const select = vi.fn(() => ({ from }));

  return {
    db: { select },
    extractClaimIntake: vi.fn(),
    selectWhere,
    txInsert,
    txUpdateSet,
    withTenantContext: vi.fn(async (_context: unknown, callback: (tx: unknown) => unknown) =>
      callback({ insert: txInsert, update: vi.fn(() => ({ set: txUpdateSet })) })
    ),
  };
});

vi.mock('@/lib/db.server', () => ({ db: mocks.db }));
vi.mock('@interdomestik/database', () => ({ withTenantContext: mocks.withTenantContext }));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: { __name: 'ai_runs', id: { __name: 'ai_runs.id' }, status: {}, entityType: {} },
  claims: { __name: 'claim', id: {}, tenantId: {} },
  documentExtractions: { __name: 'document_extractions', sourceRunId: {} },
  documents: { __name: 'documents', id: {}, tenantId: {} },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));
vi.mock('@interdomestik/domain-ai/claims/intake-extract', () => ({
  extractClaimIntake: mocks.extractClaimIntake,
}));

import { processClaimDocumentWorkflowRunService } from './claim-workflows';
import { claimIntakeAiCallContext } from '@/test/ai-call-context';

describe('processClaimDocumentWorkflowRunService critique gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectWhere.mockResolvedValue([
      {
        runId: 'run-1',
        tenantId: 'tenant-1',
        workflow: 'claim_intake_extract',
        documentId: 'doc-1',
        claimId: 'claim-1',
        storagePath: 'pii/tenants/tenant-1/claims/claim-1/evidence.txt',
        fileName: 'evidence.txt',
        mimeType: 'text/plain',
        uploadedAt: new Date('2026-03-08T10:00:00.000Z'),
        status: 'queued',
        requestJson: { aiCallContext: claimIntakeAiCallContext, bucket: 'claim-evidence' },
        claimTitle: 'Flight delay claim',
        claimDescription: 'Delay overnight.',
        claimCategory: 'travel',
        claimAmount: '0',
        claimCurrency: 'EUR',
      },
    ]);
    mocks.extractClaimIntake.mockResolvedValue({
      title: 'Flight delay claim',
      summary: 'Extraction had no usable content.',
      category: 'travel',
      incidentDate: '2026-02-15',
      countryCode: 'ZZ',
      estimatedAmount: 0,
      currency: 'EUR',
      confidence: 0,
      warnings: ['Document text was empty.'],
    });
  });

  it('marks the run failed and skips extraction persistence for failed critique', async () => {
    const result = await processClaimDocumentWorkflowRunService({
      runId: 'run-1',
      deps: {
        downloadFile: vi.fn().mockResolvedValue(Buffer.alloc(0)),
        analyzePdf: vi.fn().mockResolvedValue(''),
      },
    });

    expect(result).toEqual({
      status: 'failed',
      runId: 'run-1',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.txInsert).not.toHaveBeenCalled();
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'claim_intake_extract_critique_failed',
      })
    );
  });

  it('marks the run failed before persistence when output is schema-invalid', async () => {
    mocks.extractClaimIntake.mockResolvedValue({
      title: 'Flight delay claim',
      summary: 'Invalid amount.',
      category: 'travel',
      incidentDate: '2026-02-15',
      countryCode: 'ZZ',
      estimatedAmount: '0',
      currency: 'EUR',
      confidence: 0.8,
      warnings: [],
    });

    const result = await processClaimDocumentWorkflowRunService({
      runId: 'run-1',
      deps: {
        downloadFile: vi.fn().mockResolvedValue(Buffer.from('claim text')),
        analyzePdf: vi.fn().mockResolvedValue('Claim text with enough usable content.'),
      },
    });

    expect(result).toEqual({
      status: 'failed',
      runId: 'run-1',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.txInsert).not.toHaveBeenCalled();
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'claim_intake_extract_validation_failed',
      })
    );
  });
});
