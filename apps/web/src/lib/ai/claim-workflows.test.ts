import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const txInsertOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const txInsertValues = vi.fn();
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
    innerJoin: selectInnerJoin,
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
    db: {
      select,
      transaction,
      update,
    },
    extractClaimIntake: vi.fn(),
    extractLegalDocument: vi.fn(),
    inngestSend: vi.fn(),
    nanoid: vi.fn().mockReturnValueOnce('extraction-1').mockReturnValueOnce('extraction-2'),
    selectWhere,
    txInsert,
    txInsertOnConflictDoNothing,
    txInsertValues,
    txUpdateSet,
    updateReturning,
  };
});

vi.mock('@/lib/db.server', () => ({
  db: mocks.db,
}));

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: mocks.inngestSend,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: { __name: 'ai_runs', id: { __name: 'ai_runs.id' }, status: { __name: 'ai_runs.status' } },
  claims: { __name: 'claim', id: { __name: 'claim.id' } },
  documentExtractions: {
    __name: 'document_extractions',
    sourceRunId: { __name: 'document_extractions.source_run_id' },
  },
  documents: { __name: 'documents', id: { __name: 'documents.id' } },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ __op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ __op: 'eq', left, right })),
}));

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));

vi.mock('@interdomestik/domain-ai/claims/intake-extract', () => ({
  extractClaimIntake: mocks.extractClaimIntake,
}));

vi.mock('@interdomestik/domain-ai/legal/extract', () => ({
  extractLegalDocument: mocks.extractLegalDocument,
}));

import {
  emitClaimAiRunRequestedService,
  processClaimDocumentWorkflowRunService,
} from './claim-workflows';

describe('emitClaimAiRunRequestedService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps claim workflows to the correct Inngest event names', async () => {
    await emitClaimAiRunRequestedService({
      runId: 'run-1',
      workflow: 'claim_intake_extract',
      claimId: 'claim-1',
      documentId: 'doc-1',
    });
    await emitClaimAiRunRequestedService({
      runId: 'run-2',
      workflow: 'legal_doc_extract',
      claimId: 'claim-1',
      documentId: 'doc-2',
    });

    expect(mocks.inngestSend).toHaveBeenNthCalledWith(1, {
      name: 'claim/intake-extract.requested',
      data: {
        runId: 'run-1',
        workflow: 'claim_intake_extract',
        claimId: 'claim-1',
        documentId: 'doc-1',
      },
    });
    expect(mocks.inngestSend).toHaveBeenNthCalledWith(2, {
      name: 'legal/extract.requested',
      data: {
        runId: 'run-2',
        workflow: 'legal_doc_extract',
        claimId: 'claim-1',
        documentId: 'doc-2',
      },
    });
  });
});

describe('processClaimDocumentWorkflowRunService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nanoid.mockReturnValueOnce('extraction-1').mockReturnValueOnce('extraction-2');
    mocks.txInsertValues.mockImplementation(() => ({
      onConflictDoNothing: mocks.txInsertOnConflictDoNothing,
    }));
    mocks.updateReturning.mockResolvedValue([{ id: 'run-1' }]);
  });

  it('processes a queued claim-intake run and persists a document extraction', async () => {
    mocks.selectWhere.mockResolvedValue([
      {
        runId: 'run-1',
        tenantId: 'tenant-1',
        workflow: 'claim_intake_extract',
        documentId: 'doc-1',
        claimId: 'claim-1',
        storagePath: 'pii/tenants/tenant-1/claims/claim-1/evidence.pdf',
        fileName: 'evidence.pdf',
        mimeType: 'application/pdf',
        uploadedAt: new Date('2026-03-08T10:00:00.000Z'),
        status: 'queued',
        requestJson: {
          claimSnapshot: {
            incidentDate: '2026-02-15',
          },
        },
        claimTitle: 'Flight delay claim',
        claimDescription: 'Delay overnight.',
        claimCategory: 'travel',
        claimCompanyName: 'Airline Co',
        claimAmount: '650.00',
        claimCurrency: 'EUR',
      },
    ]);
    mocks.extractClaimIntake.mockResolvedValue({
      title: 'Flight delay claim',
      summary: 'Extracted from claim context.',
      category: 'travel',
      incidentDate: '2026-02-15',
      countryCode: 'ZZ',
      estimatedAmount: 650,
      currency: 'EUR',
      confidence: 0.62,
      warnings: ['Country inferred from fallback'],
    });

    const result = await processClaimDocumentWorkflowRunService({
      runId: 'run-1',
      deps: {
        downloadFile: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
        analyzePdf: vi.fn().mockResolvedValue('Country: IT'),
      },
    });

    expect(result).toEqual({
      status: 'completed',
      runId: 'run-1',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
      extraction: expect.objectContaining({
        title: 'Flight delay claim',
      }),
    });
    expect(mocks.extractClaimIntake).toHaveBeenCalled();
    expect(mocks.txInsert).toHaveBeenCalledWith(
      expect.objectContaining({ __name: 'document_extractions' })
    );
    expect(mocks.txUpdateSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'completed',
        completedAt: expect.any(Date),
      })
    );
  });

  it('processes a queued legal-document run and persists a legal extraction', async () => {
    mocks.selectWhere.mockResolvedValue([
      {
        runId: 'run-1',
        tenantId: 'tenant-1',
        workflow: 'legal_doc_extract',
        documentId: 'doc-2',
        claimId: 'claim-1',
        storagePath: 'pii/tenants/tenant-1/claims/claim-1/demand-letter.pdf',
        fileName: 'demand-letter.pdf',
        mimeType: 'application/pdf',
        uploadedAt: new Date('2026-03-08T10:00:00.000Z'),
        status: 'queued',
        requestJson: {},
        claimTitle: 'Flight delay claim',
        claimDescription: 'Delay overnight.',
        claimCategory: 'travel',
        claimCompanyName: 'Airline Co',
        claimAmount: '650.00',
        claimCurrency: 'EUR',
      },
    ]);
    mocks.extractLegalDocument.mockResolvedValue({
      documentType: 'demand_letter',
      issuer: 'Contoso Legal',
      jurisdiction: 'Germany',
      effectiveDate: '2026-02-20',
      summary: 'Demand letter summary.',
      obligations: ['Respond within 14 days'],
      confidence: 0.74,
      warnings: [],
    });

    const result = await processClaimDocumentWorkflowRunService({
      runId: 'run-1',
      deps: {
        downloadFile: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
        analyzePdf: vi.fn().mockResolvedValue('Demand letter issued by Contoso Legal'),
      },
    });

    expect(result).toEqual({
      status: 'completed',
      runId: 'run-1',
      claimId: 'claim-1',
      workflow: 'legal_doc_extract',
      extraction: expect.objectContaining({
        documentType: 'demand_letter',
      }),
    });
    expect(mocks.extractLegalDocument).toHaveBeenCalled();
  });
});
