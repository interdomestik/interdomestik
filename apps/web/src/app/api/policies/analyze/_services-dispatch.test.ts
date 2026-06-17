import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inngestSend: vi.fn(),
}));

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: mocks.inngestSend },
}));

vi.mock('@/lib/ai/policy-analyzer', () => ({
  analyzePolicyImages: vi.fn(),
  analyzePolicyText: vi.fn(),
}));
vi.mock('@/lib/db.server', () => ({ db: {} }));
vi.mock('@/lib/storage/service-role', () => ({ uploadTenantObject: vi.fn() }));
vi.mock('@interdomestik/database', () => ({ withTenantContext: vi.fn() }));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: {},
  documentExtractions: {},
  documents: {},
  policies: {},
}));
vi.mock('@interdomestik/domain-ai/models', () => ({
  getResponsesWorkflowConfig: () => ({
    model: 'gpt-5.5',
    promptCacheKey: 'policy-cache',
    promptVersion: 'policy_extract_v1',
  }),
}));
vi.mock('@interdomestik/domain-ai/schemas/policy-extract', () => ({
  policyExtractSchema: { parse: vi.fn() },
}));
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn() }));
vi.mock('nanoid', () => ({ nanoid: vi.fn() }));
vi.mock('./_storage-download', () => ({ downloadPolicyFileWithRetry: vi.fn() }));

import { emitPolicyExtractionRequestedService } from './_services';

describe('emitPolicyExtractionRequestedService retry integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries transient Inngest dispatch failures', async () => {
    mocks.inngestSend.mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValueOnce({});

    await emitPolicyExtractionRequestedService({
      policyId: 'policy-1',
      runId: 'run-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(mocks.inngestSend).toHaveBeenCalledTimes(2);
  });

  it('does not retry quota exhaustion past the bounded budget', async () => {
    mocks.inngestSend.mockRejectedValue(
      Object.assign(new Error('quota exhausted'), { status: 429 })
    );

    await expect(
      emitPolicyExtractionRequestedService({
        policyId: 'policy-1',
        runId: 'run-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
      })
    ).rejects.toThrow('quota exhausted');

    expect(mocks.inngestSend).toHaveBeenCalledTimes(2);
  });
});
