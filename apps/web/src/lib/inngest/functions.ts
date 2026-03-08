import {
  processAnnualReports,
  processEmailSequences,
  processSeasonalCampaigns,
} from '@interdomestik/domain-communications/cron-service';
import { processClaimDocumentWorkflowRunService } from '@/lib/ai/claim-workflows';
import { processPolicyAnalysisRunService } from '@/app/api/policies/analyze/_services';
import { inngest } from './client';

/**
 * Daily Email Sequences Function
 * Replaces the /api/cron/engagement endpoint with a durable Inngest function.
 * Runs daily at 8:00 AM UTC.
 */
export const dailyEmailSequences = inngest.createFunction(
  { id: 'daily-email-sequences' },
  { cron: '0 8 * * *' }, // Every day at 8:00 AM UTC
  async ({ step }) => {
    // Step 1: Process standard email sequences (welcome, onboarding, checkin)
    const emailResult = await step.run('process-email-sequences', async () => {
      return await processEmailSequences();
    });

    // Step 2: Process annual reports (e.g., year-end summary)
    const annualResult = await step.run('process-annual-reports', async () => {
      return await processAnnualReports();
    });

    return {
      emailSequences: emailResult,
      annualReports: annualResult,
    };
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
    const result = await step.run('process-seasonal', async () => {
      return await processSeasonalCampaigns();
    });

    return result;
  }
);

export const policyExtractionRequested = inngest.createFunction(
  { id: 'policy-extraction-requested' },
  { event: 'policy/extract.requested' },
  async ({ event, step }) => {
    return step.run('process-policy-extraction', async () => {
      return processPolicyAnalysisRunService({
        runId: event.data.runId,
      });
    });
  }
);

export const claimIntakeExtractionRequested = inngest.createFunction(
  { id: 'claim-intake-extraction-requested' },
  { event: 'claim/intake-extract.requested' },
  async ({ event, step }) => {
    return step.run('process-claim-intake-extraction', async () => {
      return processClaimDocumentWorkflowRunService({
        runId: event.data.runId,
      });
    });
  }
);

export const legalDocumentExtractionRequested = inngest.createFunction(
  { id: 'legal-document-extraction-requested' },
  { event: 'legal/extract.requested' },
  async ({ event, step }) => {
    return step.run('process-legal-document-extraction', async () => {
      return processClaimDocumentWorkflowRunService({
        runId: event.data.runId,
      });
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
