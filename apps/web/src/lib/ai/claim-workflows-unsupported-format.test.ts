import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const createFunction = vi.fn(
    (config: unknown, trigger: unknown, handler: (...args: unknown[]) => unknown) => ({
      config,
      handler,
      trigger,
    })
  );
  const selectWhere = vi.fn();
  const secondJoin = { where: selectWhere };
  const firstJoin = { innerJoin: vi.fn(() => secondJoin), where: selectWhere };
  const fromResult = { innerJoin: vi.fn(() => firstJoin) };
  const from = vi.fn(() => fromResult);
  const select = vi.fn(() => ({ from }));
  const txInsert = vi.fn();
  const txUpdateSet = vi.fn((values: { errorCode?: string; status?: string }) => ({
    where: vi.fn(() => ({
      returning: vi.fn(async () => [
        values.status === 'failed' ? { id: 'run-1', errorCode: values.errorCode } : { id: 'run-1' },
      ]),
    })),
  }));
  const tenantTx = {
    insert: txInsert,
    update: vi.fn(() => ({ set: txUpdateSet })),
  };

  return {
    createFunction,
    db: { select },
    downloadClaimAiFileWithRetry: vi.fn(),
    extractClaimIntake: vi.fn(),
    extractLegalDocument: vi.fn(),
    selectWhere,
    txInsert,
    txUpdateSet,
    withTenantContext: vi.fn(async (_context: unknown, callback: (tx: unknown) => unknown) =>
      callback(tenantTx)
    ),
  };
});

vi.mock('@/lib/db.server', () => ({ db: mocks.db }));
vi.mock('@/lib/inngest/client', () => ({
  inngest: { createFunction: mocks.createFunction, send: vi.fn() },
}));
vi.mock('@/lib/ai/claim-storage-download', () => ({
  downloadClaimAiFileWithRetry: mocks.downloadClaimAiFileWithRetry,
}));
vi.mock('@/lib/ai/dispatch-failure', () => ({ markAiRunDispatchFailedWithTenantContext: vi.fn() }));
vi.mock('@/lib/reliability/transient-retry', () => ({
  throwTransientRetryFailure: vi.fn(),
  withTransientRetry: vi.fn(),
}));
vi.mock('@/app/api/policies/analyze/_services', () => ({
  processPolicyAnalysisRunService: vi.fn(),
}));
vi.mock('@interdomestik/domain-communications/cron-service', () => ({
  processAnnualReports: vi.fn(),
  processEmailSequences: vi.fn(),
  processSeasonalCampaigns: vi.fn(),
}));
vi.mock('@interdomestik/database', () => ({
  sql: vi.fn(),
  withTenantContext: mocks.withTenantContext,
}));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: { id: {}, status: {}, errorCode: {}, entityType: {} },
  claims: { id: {}, tenantId: {} },
  documentExtractions: { sourceRunId: {}, tenantId: {} },
  documents: { id: {}, tenantId: {}, deletedAt: {} },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  isNull: vi.fn((field: unknown) => ({ field })),
}));
vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'extraction-1') }));
vi.mock('@interdomestik/domain-ai', () => ({
  CLAIM_INTAKE_EXTRACT_SCHEMA_VERSION: 'claim-v1',
  LEGAL_DOC_EXTRACT_SCHEMA_VERSION: 'legal-v1',
}));
vi.mock('@interdomestik/domain-ai/claims/intake-extract', () => ({
  extractClaimIntake: mocks.extractClaimIntake,
}));
vi.mock('@interdomestik/domain-ai/legal/extract', () => ({
  extractLegalDocument: mocks.extractLegalDocument,
}));
vi.mock('@interdomestik/domain-claims', () => ({
  mintClaimDocumentAiCallContext: vi.fn(),
  resolveClaimDocumentAiExtractionConsent: vi.fn(),
}));

import { processClaimDocumentWorkflowRunService } from './claim-workflows';
import { claimIntakeExtractionRequested } from '@/lib/inngest/functions';

type Workflow = 'claim_intake_extract' | 'legal_doc_extract';
type ClaimHandler = (args: {
  attempt: number;
  event: { data: { runId: string } };
  step: { run: (name: string, callback: () => unknown) => unknown };
}) => Promise<unknown>;

function queuedRun(workflow: Workflow, mimeType: string) {
  return {
    runId: 'run-1',
    tenantId: 'tenant-1',
    workflow,
    documentId: 'doc-1',
    claimId: 'claim-1',
    requestedBy: 'user-1',
    subjectId: 'member-1',
    storagePath: 'pii/tenants/tenant-1/claims/claim-1/evidence',
    fileName: 'evidence',
    mimeType,
    uploadedAt: new Date('2026-09-11T00:00:00.000Z'),
    status: 'queued',
    errorCode: null,
    requestJson: { bucket: 'claim-evidence' },
    claimTitle: 'Claim',
    claimDescription: null,
    claimCategory: 'travel',
    claimAmount: null,
    claimCurrency: 'EUR',
  };
}

function failedUpdate() {
  return mocks.txUpdateSet.mock.calls.find(([values]) => values.status === 'failed')?.[0];
}

describe('claim workflow unsupported formats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.downloadClaimAiFileWithRetry.mockResolvedValue(Buffer.from('binary'));
  });

  it.each([
    ['claim_intake_extract', 'image/jpeg'],
    ['legal_doc_extract', 'audio/webm'],
  ] as const)(
    'fails %s permanently through the real service decoder',
    async (workflow, mimeType) => {
      mocks.selectWhere.mockResolvedValue([queuedRun(workflow, mimeType)]);
      const downloadFile = vi.fn().mockResolvedValue(Buffer.from('binary'));

      await expect(
        processClaimDocumentWorkflowRunService({ runId: 'run-1', deps: { downloadFile } })
      ).resolves.toEqual({
        status: 'failed',
        runId: 'run-1',
        claimId: 'claim-1',
        workflow,
      });

      expect(downloadFile).toHaveBeenCalledWith(
        'claim-evidence',
        'pii/tenants/tenant-1/claims/claim-1/evidence',
        'tenant-1'
      );
      expect(failedUpdate()).toEqual(
        expect.objectContaining({
          status: 'failed',
          errorCode: 'claim_ai_unsupported_document_type',
        })
      );
      expect(mocks.extractClaimIntake).not.toHaveBeenCalled();
      expect(mocks.extractLegalDocument).not.toHaveBeenCalled();
      expect(mocks.txInsert).not.toHaveBeenCalled();
    }
  );

  it('returns a permanent failure through the actual Inngest handler boundary', async () => {
    mocks.selectWhere.mockResolvedValue([queuedRun('claim_intake_extract', 'image/png')]);
    const step = { run: vi.fn(async (_name: string, callback: () => unknown) => callback()) };
    const handler = (claimIntakeExtractionRequested as unknown as { handler: ClaimHandler })
      .handler;

    await expect(
      handler({ event: { data: { runId: 'run-1' } }, step, attempt: 0 })
    ).resolves.toEqual({
      status: 'failed',
      runId: 'run-1',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });

    expect(step.run).toHaveBeenCalledWith('process-claim-intake-extraction', expect.any(Function));
    expect(mocks.downloadClaimAiFileWithRetry).toHaveBeenCalledWith({
      bucket: 'claim-evidence',
      filePath: 'pii/tenants/tenant-1/claims/claim-1/evidence',
      tenantId: 'tenant-1',
    });
    expect(failedUpdate()).toEqual(
      expect.objectContaining({ errorCode: 'claim_ai_unsupported_document_type' })
    );
    expect(mocks.extractClaimIntake).not.toHaveBeenCalled();
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });
});
