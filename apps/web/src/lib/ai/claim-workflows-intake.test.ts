import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const txInsertOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txUpdateReturning = vi.fn();
  const txUpdateWhere = vi.fn(() => ({ returning: txUpdateReturning }));
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const txExecute = vi.fn();
  const selectWhere = vi.fn();
  const selectInnerJoin = vi.fn(() => ({ innerJoin: selectInnerJoin, where: selectWhere }));
  const selectFrom = vi.fn(() => ({ innerJoin: selectInnerJoin, where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const tenantWriteTx = {
    execute: txExecute,
    insert: txInsert,
    select,
    update: txUpdate,
  };
  const transaction = vi.fn(
    async (
      callback: (tx: { insert: typeof txInsert; update: typeof txUpdate }) => Promise<unknown>
    ) => callback({ insert: txInsert, update: txUpdate })
  );

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
    authorizeInngestEventTenant: vi.fn(),
    db: {
      select,
      transaction,
      update,
    },
    extractClaimIntake: vi.fn(),
    extractLegalDocument: vi.fn(),
    mintClaimDocumentAiCallContext: vi.fn(),
    inngestSend: vi.fn(),
    nanoid: vi.fn().mockReturnValueOnce('extraction-1').mockReturnValueOnce('extraction-2'),
    resolveClaimDocumentAiExtractionConsent: vi.fn(),
    resolveEvidenceBucketName: vi.fn().mockReturnValue('resolved-evidence-bucket'),
    selectWhere,
    txInsert,
    txInsertOnConflictDoNothing,
    txInsertValues,
    txExecute,
    txUpdate,
    txUpdateReturning,
    txUpdateSet,
    updateReturning,
    withTenantContext: vi.fn(
      async (_context: unknown, callback: (tx: typeof tenantWriteTx) => Promise<unknown>) =>
        callback(tenantWriteTx)
    ),
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

vi.mock('@/lib/storage/evidence-bucket', () => ({
  DEFAULT_EVIDENCE_BUCKET: 'claim-evidence',
  resolveEvidenceBucketName: mocks.resolveEvidenceBucketName,
}));

vi.mock('@interdomestik/database', () => ({
  authorizeInngestEventTenant: mocks.authorizeInngestEventTenant,
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: { __name: 'ai_runs', id: { __name: 'ai_runs.id' }, status: { __name: 'ai_runs.status' } },
  claims: { __name: 'claim', id: { __name: 'claim.id' } },
  documentExtractions: {
    __name: 'document_extractions',
    sourceRunId: { __name: 'document_extractions.source_run_id' },
  },
  documents: { __name: 'documents', deletedAt: {}, id: { __name: 'documents.id' } },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ __op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ __op: 'eq', left, right })),
  isNull: vi.fn((field: unknown) => ({ __op: 'isNull', field })),
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

vi.mock('@interdomestik/domain-ai', () => ({
  CLAIM_INTAKE_EXTRACT_SCHEMA_VERSION: 'claim_schema_version_test',
  LEGAL_DOC_EXTRACT_SCHEMA_VERSION: 'legal_schema_version_test',
}));

vi.mock('@interdomestik/domain-claims', () => ({
  mintClaimDocumentAiCallContext: mocks.mintClaimDocumentAiCallContext,
  resolveClaimDocumentAiExtractionConsent: mocks.resolveClaimDocumentAiExtractionConsent,
}));

import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { IngressCapability } from '@interdomestik/database/ingress';
import { processClaimDocumentWorkflowRunService } from './claim-workflows';
import { claimIntakeAiCallContext } from '@/test/ai-call-context';

const authority = mintTestTenantAuthority('tenant-1');
const ingress = Object.freeze({}) as unknown as IngressCapability<'inngest'>;

function buildQueuedRun(
  overrides: Partial<{
    workflow: 'claim_intake_extract' | 'legal_doc_extract';
    documentId: string;
    storagePath: string;
    fileName: string;
    requestJson: Record<string, unknown>;
  }> = {}
) {
  return {
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
    ...overrides,
  };
}

function buildProcessingDeps(analyzePdfResult: string) {
  return {
    downloadFile: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
    analyzePdf: vi.fn().mockResolvedValue(analyzePdfResult),
  };
}

describe('processClaimDocumentWorkflowRunService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeInngestEventTenant.mockResolvedValue(authority);
    mocks.nanoid.mockReturnValueOnce('extraction-1').mockReturnValueOnce('extraction-2');
    mocks.resolveEvidenceBucketName.mockReturnValue('resolved-evidence-bucket');
    mocks.resolveClaimDocumentAiExtractionConsent.mockResolvedValue({
      kind: 'granted',
      grant: { consentEventId: 'consent-1', recordedAt: '2026-06-21T10:00:00.000Z' },
    });
    mocks.mintClaimDocumentAiCallContext.mockReturnValue(claimIntakeAiCallContext);
    mocks.txInsertValues.mockImplementation(() => ({
      onConflictDoNothing: mocks.txInsertOnConflictDoNothing,
    }));
    mocks.txExecute.mockResolvedValue([{ id: 'doc-1' }]);
    mocks.txUpdateReturning.mockResolvedValue([{ id: 'run-1' }]);
  });

  it('processes a queued claim-intake run and persists a document extraction', async () => {
    mocks.selectWhere.mockResolvedValue([buildQueuedRun()]);
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
      ingress,
      tenantId: 'tenant-1',
      deps: buildProcessingDeps('Country: IT'),
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
    expect(mocks.resolveClaimDocumentAiExtractionConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        subjectId: 'member-1',
        claimId: 'claim-1',
        documentId: 'doc-1',
      })
    );
    expect(mocks.extractClaimIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        claimSnapshot: { incidentDate: '2026-02-15' },
      })
    );
    expect(mocks.authorizeInngestEventTenant).toHaveBeenCalledWith(ingress, 'tenant-1');
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toBe(authority);
    expect(mocks.txUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ __name: 'ai_runs' })
    );
    expect(mocks.txUpdateReturning).toHaveBeenCalledWith({ id: { __name: 'ai_runs.id' } });
    expect(mocks.txInsert).toHaveBeenCalledWith(
      expect.objectContaining({ __name: 'document_extractions' })
    );
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 'claim_schema_version_test',
      })
    );
    expect(mocks.txUpdateSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'completed',
        completedAt: expect.any(Date),
      })
    );
  });
});
