import { db } from '@interdomestik/database';
import { endOfDay, startOfDay, subDays } from 'date-fns';
import {
  USER_BATCH_SIZE,
  executeCampaign,
  processBatchedUserCampaign,
  processStandardUserCampaign,
  withRetries,
} from './campaign-execution';
import {
  sendAnnualReportEmail,
  sendCheckinEmail,
  sendOnboardingEmail,
  sendSeasonalEmail,
  sendWelcomeEmail,
} from './email';
import { sendNotification } from './notifications/notify';

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

export async function processSeasonalCampaigns() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  let season: 'winter' | 'summer' | null = null;
  let campaignId = '';

  if (month >= 9 && month <= 11) {
    season = 'winter';
    campaignId = `seasonal_winter_${year}`;
  } else if (month >= 4 && month <= 5) {
    season = 'summer';
    campaignId = `seasonal_summer_${year}`;
  }

  if (!season) return { processed: false, message: 'No active seasonal campaign' };

  const result = await processBatchedUserCampaign({
    campaignId,
    sendToUser: async u => {
      await withRetries(() => sendSeasonalEmail(u.email!, { season: season!, name: u.name ?? '' }));
      await withRetries(() =>
        sendNotification(
          u.id,
          'sla_warning',
          {},
          {
            title: season === 'winter' ? 'Winter Safety Check ❄️' : 'Summer Readiness ☀️',
            actionUrl: '/dashboard',
          }
        )
      );
    },
  });

  return {
    processed: true,
    ...result,
  };
}

export async function processAnnualReports() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  // Annual Reports trigger in December (11)
  if (month !== 11) return { processed: false, message: 'Annual reports only process in December' };

  const campaignId = `annual_report_${year}`;

  const result = await processBatchedUserCampaign({
    campaignId,
    sendToUser: async u => {
      await withRetries(() => sendAnnualReportEmail(u.email!, u.name ?? '', year));
      await withRetries(() =>
        sendNotification(
          u.id,
          'sla_warning',
          {},
          {
            title: `Your ${year} Protection Summary is Ready! 🏆`,
            actionUrl: '/dashboard/wrapped',
          }
        )
      );
    },
  });

  return {
    processed: true,
    ...result,
  };
}

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
