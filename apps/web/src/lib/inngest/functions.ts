import type { IngressCapability } from '@interdomestik/database/ingress';
import { mintIngressCapability } from '@interdomestik/database/ingress-registrar';
import {
  processEmailSequences,
  processSeasonalCampaigns,
} from '@interdomestik/domain-communications/cron-service';
import {
  PersistedClaimAiRetryableError,
  processClaimDocumentWorkflowRunService,
} from '@/lib/ai/claim-workflows';
import { processPolicyAnalysisRunService } from '@/app/api/policies/analyze/_services';
import { NonRetriableError } from 'inngest';
import { inngest } from './client';

/**
 * AI run events carry the tenant of the tenant-scoped producer that queued the run. Workers bind
 * every run lookup to that tenant; an event without one cannot be processed and is not retried.
 */
function requireRunEvent(data: unknown): { runId: string; tenantId: string } {
  const event = (data ?? {}) as { runId?: unknown; tenantId?: unknown };
  if (typeof event.runId !== 'string' || !event.runId.trim()) {
    throw new NonRetriableError('AI run event is missing runId.');
  }
  if (typeof event.tenantId !== 'string' || !event.tenantId.trim()) {
    throw new NonRetriableError('AI run event is missing tenantId.');
  }
  return { runId: event.runId, tenantId: event.tenantId };
}

async function processClaimAiStep(
  ingress: IngressCapability<'inngest'>,
  runId: string,
  tenantId: string,
  retryFailed: boolean
) {
  try {
    return await processClaimDocumentWorkflowRunService({ runId, ingress, tenantId, retryFailed });
  } catch (error) {
    if (error instanceof PersistedClaimAiRetryableError) throw error;
    throw new NonRetriableError('Claim AI run failed before retry eligibility was persisted.', {
      cause: error,
    });
  }
}

/**
 * Daily Email Sequences Function
 * Replaces the /api/cron/engagement endpoint with a durable Inngest function.
 * Runs daily at 8:00 AM UTC.
 */
export const dailyEmailSequences = inngest.createFunction(
  { id: 'daily-email-sequences' },
  { cron: '0 8 * * *' }, // Every day at 8:00 AM UTC
  async ({ step }) => {
    // Standard email sequences (welcome, onboarding, checkin).
    // Invoked only through the signed Inngest serve endpoint; each step mints its own capability so a retry gets a fresh one.
    const emailResult = await step.run('process-email-sequences', async () => {
      const ingress = mintIngressCapability('inngest');
      return await processEmailSequences(ingress);
    });

    return { emailSequences: emailResult };
  }
);

/**
 * Seasonal Campaigns Function
 * Runs on specific dates (configurable) for seasonal messaging.
 * Currently set to run on the 1st of each month.
 */
export const seasonalCampaigns = inngest.createFunction(
  { id: 'seasonal-campaigns' },
  { cron: '0 9 1 * *' }, // 1st of every month at 9:00 AM UTC
  async ({ step }) => {
    // Invoked only through the signed Inngest serve endpoint.
    const result = await step.run('process-seasonal', async () => {
      const ingress = mintIngressCapability('inngest');
      return await processSeasonalCampaigns(ingress);
    });

    return result;
  }
);

export const policyExtractionRequested = inngest.createFunction(
  { id: 'policy-extraction-requested' },
  { event: 'policy/extract.requested' },
  async ({ event, step }) => {
    const { runId, tenantId } = requireRunEvent(event.data);
    return step.run('process-policy-extraction', async () => {
      // Invoked only through the signed Inngest serve endpoint; the service derives the tenant authority.
      const ingress = mintIngressCapability('inngest');
      return processPolicyAnalysisRunService({ runId, ingress, tenantId });
    });
  }
);

export const claimIntakeExtractionRequested = inngest.createFunction(
  { id: 'claim-intake-extraction-requested', retries: 1 },
  { event: 'claim/intake-extract.requested' },
  async ({ event, step, attempt }) => {
    const { runId, tenantId } = requireRunEvent(event.data);
    return step.run('process-claim-intake-extraction', async () => {
      const ingress = mintIngressCapability('inngest');
      return processClaimAiStep(ingress, runId, tenantId, attempt === 1);
    });
  }
);

export const legalDocumentExtractionRequested = inngest.createFunction(
  { id: 'legal-document-extraction-requested', retries: 1 },
  { event: 'legal/extract.requested' },
  async ({ event, step, attempt }) => {
    const { runId, tenantId } = requireRunEvent(event.data);
    return step.run('process-legal-document-extraction', async () => {
      const ingress = mintIngressCapability('inngest');
      return processClaimAiStep(ingress, runId, tenantId, attempt === 1);
    });
  }
);

/**
 * All Inngest functions to register with the handler
 */
export const inngestFunctions = [
  dailyEmailSequences,
  seasonalCampaigns,
  policyExtractionRequested,
  claimIntakeExtractionRequested,
  legalDocumentExtractionRequested,
];
