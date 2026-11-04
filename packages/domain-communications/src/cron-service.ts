import { listScheduledTenantWork } from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { endOfDay, startOfDay, subDays } from 'date-fns';
import {
  USER_BATCH_SIZE,
  executeCampaign,
  processStandardUserCampaign,
  withRetries,
} from './campaign-execution';
import { sendCheckinEmail, sendOnboardingEmail, sendWelcomeEmail } from './email';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { forEachInOrder } from './in-order';

type CronIngress = IngressCapability<'cron' | 'inngest'>;

export async function processEmailSequences(ingress: CronIngress) {
  const result = {
    processed: true,
    logs: [] as string[],
    errors: [] as string[],
    stats: { attempted: 0, sent: 0, skipped: 0, failed: 0 },
  };

  await Promise.all([
    runWelcomeCampaign(ingress, result),
    runOnboardingCampaign(ingress, result),
    runCheckinCampaign(ingress, result),
  ]);

  return result;
}

export { processSeasonalCampaigns } from './strategies/seasonal';

async function runWelcomeCampaign(
  ingress: CronIngress,
  context: { logs: string[]; errors: string[]; stats: any }
) {
  const campaignId = 'welcome_day_0';
  const now = new Date();

  await forEachInOrder(await listScheduledTenantWork(ingress), async ({ authority }) => {
    const { tenantId } = readTenantAuthority(authority);
    await executeCampaign(
      campaignId,
      authority,
      afterId =>
        withTenantAuthority(authority, tx =>
          tx.query.subscriptions.findMany({
            where: (subscriptions, { eq, and, gt }) =>
              and(
                eq(subscriptions.tenantId, tenantId),
                eq(subscriptions.status, 'active'),
                gt(subscriptions.createdAt, subDays(now, 1)),
                afterId ? gt(subscriptions.id, afterId) : undefined
              ),
            orderBy: (subscriptions, { asc }) => [asc(subscriptions.id)],
            limit: USER_BATCH_SIZE,
            with: { user: true },
          })
        ),
      async sub => {
        if (sub.user?.email && sub.user?.name) {
          const { email, name } = sub.user;
          await withRetries(() => sendWelcomeEmail(email, name));
        }
      },
      context
    );
  });
}

async function runOnboardingCampaign(
  ingress: CronIngress,
  context: { logs: string[]; errors: string[]; stats: any }
) {
  const campaignId = 'onboarding_day_3';
  const now = new Date();
  const windowStart = startOfDay(subDays(now, 3));
  const windowEnd = endOfDay(subDays(now, 3));

  await processStandardUserCampaign(
    ingress,
    campaignId,
    windowStart,
    windowEnd,
    context,
    async u => {
      if (u.email) await withRetries(() => sendOnboardingEmail(u.email!, u.name ?? ''));
    }
  );
}

async function runCheckinCampaign(
  ingress: CronIngress,
  context: { logs: string[]; errors: string[]; stats: any }
) {
  const campaignId = 'checkin_day_14';
  const now = new Date();
  const day14Start = startOfDay(subDays(now, 14));
  const day14End = endOfDay(subDays(now, 14));

  await processStandardUserCampaign(ingress, campaignId, day14Start, day14End, context, async u => {
    if (u.email) await withRetries(() => sendCheckinEmail(u.email!, u.name ?? ''));
  });
}
