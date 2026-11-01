import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class PersistedClaimAiRetryableError extends Error {}

  return {
    PersistedClaimAiRetryableError,
    createFunction: vi.fn(
      (config: unknown, trigger: unknown, handler: (...args: unknown[]) => unknown) => ({
        config,
        handler,
        trigger,
      })
    ),
    processClaimDocumentWorkflowRunService: vi.fn(),
    processPolicyAnalysisRunService: vi.fn(),
  };
});

vi.mock('./client', () => ({ inngest: { createFunction: mocks.createFunction } }));
vi.mock('@interdomestik/domain-communications/cron-service', () => ({
  processAnnualReports: vi.fn(),
  processEmailSequences: vi.fn(),
  processSeasonalCampaigns: vi.fn(),
}));
vi.mock('@/lib/ai/claim-workflows', () => ({
  PersistedClaimAiRetryableError: mocks.PersistedClaimAiRetryableError,
  processClaimDocumentWorkflowRunService: mocks.processClaimDocumentWorkflowRunService,
}));
vi.mock('@/app/api/policies/analyze/_services', () => ({
  processPolicyAnalysisRunService: mocks.processPolicyAnalysisRunService,
}));

import { NonRetriableError } from 'inngest';

import {
  claimIntakeExtractionRequested,
  legalDocumentExtractionRequested,
  policyExtractionRequested,
} from './functions';

type AiRunHandler = (args: {
  event: { data: Record<string, unknown> | undefined };
  step: { run: (name: string, callback: () => unknown) => unknown };
  attempt: number;
}) => Promise<unknown>;

const step = { run: vi.fn(async (_name: string, callback: () => unknown) => callback()) };

const handlers = [
  {
    name: 'policyExtractionRequested',
    handler: (policyExtractionRequested as unknown as { handler: AiRunHandler }).handler,
    service: mocks.processPolicyAnalysisRunService,
  },
  {
    name: 'claimIntakeExtractionRequested',
    handler: (claimIntakeExtractionRequested as unknown as { handler: AiRunHandler }).handler,
    service: mocks.processClaimDocumentWorkflowRunService,
  },
  {
    name: 'legalDocumentExtractionRequested',
    handler: (legalDocumentExtractionRequested as unknown as { handler: AiRunHandler }).handler,
    service: mocks.processClaimDocumentWorkflowRunService,
  },
];

describe('AI run Inngest handlers tenant binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processClaimDocumentWorkflowRunService.mockResolvedValue({ status: 'completed' });
    mocks.processPolicyAnalysisRunService.mockResolvedValue({ status: 'completed' });
  });

  describe.each(handlers)('$name', ({ handler, service }) => {
    it.each([
      ['no event data', undefined],
      ['no tenantId', { runId: 'run-1' }],
      ['an empty tenantId', { runId: 'run-1', tenantId: '' }],
      ['a blank tenantId', { runId: 'run-1', tenantId: '   ' }],
      ['a non-string tenantId', { runId: 'run-1', tenantId: 42 }],
      ['no runId', { tenantId: 'tenant_mk' }],
      ['a blank runId', { runId: ' ', tenantId: 'tenant_mk' }],
    ])('rejects an event with %s as non-retriable without processing', async (_case, data) => {
      const thrown = await handler({ event: { data }, step, attempt: 0 }).catch(
        (error: unknown) => error
      );

      expect(thrown).toBeInstanceOf(NonRetriableError);
      expect(service).not.toHaveBeenCalled();
      expect(step.run).not.toHaveBeenCalled();
    });

    it('does not retry a tenantless event on any attempt', async () => {
      for (const attempt of [0, 1, 2]) {
        await expect(
          handler({ event: { data: { runId: 'run-1' } }, step, attempt })
        ).rejects.toBeInstanceOf(NonRetriableError);
      }
      expect(service).not.toHaveBeenCalled();
    });

    it('passes the event runId and tenantId through to the processing service', async () => {
      await handler({
        event: { data: { runId: 'run-1', tenantId: 'tenant_mk' } },
        step,
        attempt: 0,
      });

      expect(service).toHaveBeenCalledTimes(1);
      expect(service).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 'run-1', tenantId: 'tenant_mk' })
      );
    });
  });

  it('forwards the retry intent alongside the tenant for claim workflows', async () => {
    for (const { handler } of handlers.slice(1)) {
      mocks.processClaimDocumentWorkflowRunService.mockClear();
      await handler({
        event: { data: { runId: 'run-1', tenantId: 'tenant_mk' } },
        step,
        attempt: 1,
      });
      expect(mocks.processClaimDocumentWorkflowRunService).toHaveBeenCalledWith({
        runId: 'run-1',
        tenantId: 'tenant_mk',
        retryFailed: true,
      });
    }
  });

  it('passes exactly { runId, tenantId } to the policy service', async () => {
    await handlers[0].handler({
      event: { data: { runId: 'run-1', tenantId: 'tenant_mk', policyId: 'policy-1' } },
      step,
      attempt: 0,
    });

    expect(mocks.processPolicyAnalysisRunService).toHaveBeenCalledWith({
      runId: 'run-1',
      tenantId: 'tenant_mk',
    });
  });
});
