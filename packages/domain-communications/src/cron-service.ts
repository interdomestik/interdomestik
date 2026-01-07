import { db } from '@interdomestik/database';
import { endOfDay, startOfDay, subDays } from 'date-fns';
import {
  USER_BATCH_SIZE,
  executeCampaign,
  processStandardUserCampaign,
  withRetries,
} from './campaign-execution';
import { sendCheckinEmail, sendOnboardingEmail, sendWelcomeEmail } from './email';

export async function processEmailSequences() {
  const result = {
    processed: true,
    logs: [] as string[],
    errors: [] as string[],
    stats: { attempted: 0, sent: 0, skipped: 0, failed: 0 },
  };

  await Promise.all([
    runWelcomeCampaign(result),
    runOnboardingCampaign(result),
    runCheckinCampaign(result),
  ]);

  return result;
}

export { processAnnualReports } from './strategies/annual';
export { processSeasonalCampaigns } from './strategies/seasonal';

async function runWelcomeCampaign(context: { logs: string[]; errors: string[]; stats: any }) {
  const campaignId = 'welcome_day_0';
  const now = new Date();

  await executeCampaign(
    campaignId,
    afterId =>
      db.query.subscriptions.findMany({
        where: (subscriptions, { eq, and, gt }) =>
          and(
            eq(subscriptions.status, 'active'),
            gt(subscriptions.createdAt, subDays(now, 1)),
            afterId ? gt(subscriptions.id, afterId) : undefined
          ),
        orderBy: (subscriptions, { asc }) => [asc(subscriptions.id)],
        limit: USER_BATCH_SIZE,
        with: { user: true },
      }),
    async sub => {
      const email = sub.user?.email;
      await withRetries(() => sendWelcomeEmail(email!, sub.user!.name));
    },
    context
  );
}

async function runOnboardingCampaign(context: { logs: string[]; errors: string[]; stats: any }) {
  const campaignId = 'onboarding_day_3';
  const now = new Date();
  const windowStart = startOfDay(subDays(now, 3));
  const windowEnd = endOfDay(subDays(now, 3));

  await processStandardUserCampaign(campaignId, windowStart, windowEnd, context, async u => {
    await withRetries(() => sendOnboardingEmail(u.email!, u.name ?? ''));
  });
}

async function runCheckinCampaign(context: { logs: string[]; errors: string[]; stats: any }) {
  const campaignId = 'checkin_day_14';
  const now = new Date();
  const day14Start = startOfDay(subDays(now, 14));
  const day14End = endOfDay(subDays(now, 14));

  await processStandardUserCampaign(campaignId, day14Start, day14End, context, async u => {
    await withRetries(() => sendCheckinEmail(u.email!, u.name ?? ''));
  });
}
