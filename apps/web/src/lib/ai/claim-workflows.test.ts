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

import { emitClaimAiRunRequestedService } from './claim-workflows';

describe('emitClaimAiRunRequestedService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps claim workflows to the correct Inngest event names', async () => {
    await emitClaimAiRunRequestedService({
      runId: 'run-1',
      tenantId: 'tenant-1',
      workflow: 'claim_intake_extract',
      claimId: 'claim-1',
      documentId: 'doc-1',
    });
    await emitClaimAiRunRequestedService({
      runId: 'run-2',
      tenantId: 'tenant-1',
      workflow: 'legal_doc_extract',
      claimId: 'claim-1',
      documentId: 'doc-2',
    });

    expect(mocks.inngestSend).toHaveBeenNthCalledWith(1, {
      name: 'claim/intake-extract.requested',
      data: {
        runId: 'run-1',
        tenantId: 'tenant-1',
        workflow: 'claim_intake_extract',
        claimId: 'claim-1',
        documentId: 'doc-1',
      },
    });
    expect(mocks.inngestSend).toHaveBeenNthCalledWith(2, {
      name: 'legal/extract.requested',
      data: {
        runId: 'run-2',
        tenantId: 'tenant-1',
        workflow: 'legal_doc_extract',
        claimId: 'claim-1',
        documentId: 'doc-2',
      },
    });
  });
});
