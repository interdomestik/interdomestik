import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class PersistedClaimAiRetryableError extends Error {}

  return {
    PersistedClaimAiRetryableError,
    mintIngressCapability: vi.fn(() => Object.freeze({ minted: true })),
    createFunction: vi.fn(
      (config: unknown, trigger: unknown, handler: (...args: unknown[]) => unknown) => ({
        config,
        handler,
        trigger,
      })
    ),
    processAnnualReports: vi.fn(),
    processClaimDocumentWorkflowRunService: vi.fn(),
    processEmailSequences: vi.fn(),
    processPolicyAnalysisRunService: vi.fn(),
    processSeasonalCampaigns: vi.fn(),
  };
});

vi.mock('@interdomestik/database/ingress-registrar', () => ({
  mintIngressCapability: mocks.mintIngressCapability,
}));
vi.mock('./client', () => ({ inngest: { createFunction: mocks.createFunction } }));
vi.mock('@interdomestik/domain-communications/cron-service', () => ({
  processAnnualReports: mocks.processAnnualReports,
  processEmailSequences: mocks.processEmailSequences,
  processSeasonalCampaigns: mocks.processSeasonalCampaigns,
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
  dailyEmailSequences,
  inngestFunctions,
  legalDocumentExtractionRequested,
  policyExtractionRequested,
  seasonalCampaigns,
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
        ingress: expect.any(Object),
        tenantId: 'tenant_mk',
        retryFailed: true,
      });
    }
  });

  it('passes exactly { runId, ingress, tenantId } to the policy service', async () => {
    await handlers[0].handler({
      event: { data: { runId: 'run-1', tenantId: 'tenant_mk', policyId: 'policy-1' } },
      step,
      attempt: 0,
    });

    expect(mocks.processPolicyAnalysisRunService).toHaveBeenCalledWith({
      runId: 'run-1',
      ingress: expect.any(Object),
      tenantId: 'tenant_mk',
    });
  });

  it.each(handlers)(
    '$name hands its service the capability it minted, never one carried by the event',
    async ({ handler, service }) => {
      const forged = Object.freeze({ forged: true });

      await handler({
        event: {
          data: {
            runId: 'run-1',
            tenantId: 'tenant_mk',
            ingress: forged,
            authority: forged,
          },
        },
        step,
        attempt: 0,
      });

      expect(mocks.mintIngressCapability).toHaveBeenCalledTimes(1);
      expect(mocks.mintIngressCapability).toHaveBeenCalledWith('inngest');
      const call = service.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call.ingress).toBe(mocks.mintIngressCapability.mock.results[0].value);
      expect(call.ingress).not.toBe(forged);
      expect(call).not.toHaveProperty('authority');
    }
  );

  it.each(handlers)(
    '$name mints a fresh capability for every step invocation',
    async ({ handler, service }) => {
      const event = { data: { runId: 'run-1', tenantId: 'tenant_mk' } };

      await handler({ event, step, attempt: 0 });
      await handler({ event, step, attempt: 1 });

      expect(service.mock.calls[0]?.[0].ingress).not.toBe(service.mock.calls[1]?.[0].ingress);
    }
  );
});

type ScheduledHandler = (args: {
  step: { run: (name: string, callback: () => unknown) => unknown };
}) => Promise<unknown>;

describe('scheduled email campaign Inngest handlers', () => {
  const daily = (dailyEmailSequences as unknown as { handler: ScheduledHandler }).handler;
  const seasonal = (seasonalCampaigns as unknown as { handler: ScheduledHandler }).handler;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mintIngressCapability.mockImplementation(() => Object.freeze({ minted: true }));
    mocks.processEmailSequences.mockResolvedValue({ processed: true });
    mocks.processAnnualReports.mockResolvedValue({ processed: false });
    mocks.processSeasonalCampaigns.mockResolvedValue({ processed: false });
  });

  it('hands each daily step its own Inngest ingress capability', async () => {
    const result = await daily({ step });

    expect(mocks.processEmailSequences).toHaveBeenCalledWith(expect.any(Object));
    expect(mocks.processAnnualReports).toHaveBeenCalledWith(expect.any(Object));
    expect(mocks.mintIngressCapability).toHaveBeenCalledTimes(2);
    expect(mocks.mintIngressCapability).toHaveBeenCalledWith('inngest');
    const emailIngress = mocks.processEmailSequences.mock.calls[0][0];
    const annualIngress = mocks.processAnnualReports.mock.calls[0][0];
    expect(emailIngress).toBe(mocks.mintIngressCapability.mock.results[0].value);
    expect(annualIngress).toBe(mocks.mintIngressCapability.mock.results[1].value);
    expect(annualIngress).not.toBe(emailIngress);
    expect(result).toEqual({
      emailSequences: { processed: true },
      annualReports: { processed: false },
    });
  });

  it('mints a fresh capability for a retried step', async () => {
    await daily({ step });
    await daily({ step });

    expect(mocks.processEmailSequences.mock.calls[0][0]).not.toBe(
      mocks.processEmailSequences.mock.calls[1][0]
    );
  });

  it('hands the seasonal step an Inngest ingress capability', async () => {
    await seasonal({ step });

    expect(mocks.processSeasonalCampaigns).toHaveBeenCalledWith(expect.any(Object));
    expect(mocks.mintIngressCapability).toHaveBeenCalledTimes(1);
    expect(mocks.mintIngressCapability).toHaveBeenCalledWith('inngest');
    expect(mocks.processSeasonalCampaigns.mock.calls[0][0]).toBe(
      mocks.mintIngressCapability.mock.results[0].value
    );
  });

  it('keeps the AI run functions registered and free of ingress capabilities', async () => {
    expect(inngestFunctions).toEqual([
      dailyEmailSequences,
      seasonalCampaigns,
      policyExtractionRequested,
      claimIntakeExtractionRequested,
      legalDocumentExtractionRequested,
    ]);
    await handlers[0].handler({
      event: { data: { runId: 'run-1', tenantId: 'tenant_mk' } },
      step,
      attempt: 0,
    });
    expect(mocks.processEmailSequences).not.toHaveBeenCalled();
  });
});
