import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inngestSend: vi.fn(),
}));

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: mocks.inngestSend },
}));

vi.mock('@/lib/ai/claim-storage-download', () => ({
  downloadClaimAiFileWithRetry: vi.fn(),
}));

vi.mock('@/lib/db.server', () => ({ db: {} }));
vi.mock('@interdomestik/database', () => ({ withTenantContext: vi.fn() }));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: {},
  claims: {},
  documentExtractions: {},
  documents: {},
}));
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn() }));
vi.mock('nanoid', () => ({ nanoid: vi.fn() }));
vi.mock('@interdomestik/domain-ai', () => ({
  CLAIM_INTAKE_EXTRACT_SCHEMA_VERSION: 'claim-schema',
  LEGAL_DOC_EXTRACT_SCHEMA_VERSION: 'legal-schema',
}));
vi.mock('@interdomestik/domain-ai/claims/intake-extract', () => ({
  extractClaimIntake: vi.fn(),
}));
vi.mock('@interdomestik/domain-ai/legal/extract', () => ({
  extractLegalDocument: vi.fn(),
}));

import { emitClaimAiRunRequestedService } from './claim-workflows';

describe('emitClaimAiRunRequestedService retry integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries transient Inngest dispatch failures', async () => {
    mocks.inngestSend.mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValueOnce({});

    await emitClaimAiRunRequestedService({
      claimId: 'claim-1',
      documentId: 'doc-1',
      runId: 'run-1',
      workflow: 'claim_intake_extract',
    });

    expect(mocks.inngestSend).toHaveBeenCalledTimes(2);
  });

  it('does not retry auth-classified dispatch failures', async () => {
    mocks.inngestSend.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));

    await expect(
      emitClaimAiRunRequestedService({
        claimId: 'claim-1',
        documentId: 'doc-1',
        runId: 'run-1',
        workflow: 'legal_doc_extract',
      })
    ).rejects.toThrow('forbidden');

    expect(mocks.inngestSend).toHaveBeenCalledTimes(1);
  });
});
