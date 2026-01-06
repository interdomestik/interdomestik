import { db, inArray } from '@interdomestik/database';
import { emailCampaignLogs } from '@interdomestik/database/schema';
import { endOfDay, startOfDay, subDays } from 'date-fns';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  sendAnnualReportEmail,
  sendCheckinEmail,
  sendOnboardingEmail,
  sendSeasonalEmail,
  sendWelcomeEmail,
} from './email';
import { sendNotification } from './notifications/notify';

const USER_BATCH_SIZE = 500;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_MAX_BATCHES = 100_000;

type UserMini = { id: string; email: string | null; name: string | null; tenantId: string | null };

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function stringifyError(err: unknown) {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function withRetries<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number }
): Promise<T> {
  const attempts = opts?.attempts ?? DEFAULT_RETRY_ATTEMPTS;
  const baseDelayMs = opts?.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

async function getAlreadySentUserIdSet(args: {
  campaignId: string;
  userIds: string[];
}): Promise<Set<string>> {
  if (args.userIds.length === 0) return new Set();

  const rows = await db.query.emailCampaignLogs.findMany({
    where: and(
      eq(emailCampaignLogs.campaignId, args.campaignId),
      inArray(emailCampaignLogs.userId, args.userIds)
    ),
  });

  return new Set(rows.map(r => r.userId));
}

async function getUsersBatch(args: {
  afterId: string | null;
  limit?: number;
}): Promise<UserMini[]> {
  const limit = args.limit ?? USER_BATCH_SIZE;

  // Cursor pagination by primary key keeps memory stable and avoids huge offsets.
  const users = await db.query.user.findMany({
    where: args.afterId ? (user, { gt }) => gt(user.id, args.afterId as string) : undefined,
    orderBy: (user, { asc }) => [asc(user.id)],
    limit,
    columns: {
      id: true,
      email: true,
      name: true,
      tenantId: true,
    },
  });

  return users.map(u => ({ id: u.id, email: u.email, name: u.name, tenantId: u.tenantId }));
}

export async function forEachBatchedUsers(args: {
  fetchBatch: (afterId: string | null) => Promise<UserMini[]>;
  onBatch: (batch: UserMini[], afterId: string | null) => Promise<void>;
  maxBatches?: number;
}): Promise<{ batches: number; totalUsers: number; lastAfterId: string | null }> {
  const maxBatches = args.maxBatches ?? DEFAULT_MAX_BATCHES;
  let afterId: string | null = null;
  let batches = 0;
  let totalUsers = 0;

  for (;;) {
    batches += 1;
    if (batches > maxBatches) {
      throw new Error(`Exceeded maxBatches=${maxBatches} (possible pagination loop)`);
    }

    const batch = await args.fetchBatch(afterId);
    if (batch.length === 0) break;

    totalUsers += batch.length;
    const lastId = batch[batch.length - 1]?.id;
    afterId = lastId ?? afterId;
    await args.onBatch(batch, afterId);
  }

  return { batches: Math.max(batches - 1, 0), totalUsers, lastAfterId: afterId };
}

export async function processBatchedUserCampaign(args: {
  campaignId: string;
  sendToUser: (u: UserMini) => Promise<void>;
}): Promise<{
  logs: string[];
  errors: string[];
  stats: { attempted: number; sent: number; skipped: number; failed: number };
}> {
  const logs: string[] = [];
  const errors: string[] = [];
  let attempted = 0;
  let sent = 0;
  let skipped = 0;

  await forEachBatchedUsers({
    fetchBatch: afterId => getUsersBatch({ afterId, limit: USER_BATCH_SIZE }),
    onBatch: async batch => {
      const userIds = batch.map(u => u.id);
      const alreadySentSet = await getAlreadySentUserIdSet({
        campaignId: args.campaignId,
        userIds,
      });

      for (const u of batch) {
        attempted += 1;

        if (!u.tenantId) {
          skipped += 1;
          errors.push(`Missing tenantId for userId=${u.id} email=${u.email ?? 'n/a'}`);
          continue;
        }

        if (!u.email) {
          skipped += 1;
          continue;
        }

        if (alreadySentSet.has(u.id)) {
          skipped += 1;
          continue;
        }

        try {
          await args.sendToUser(u);

          const insertLog = {
            id: `ecl_${nanoid()}`,
            tenantId: u.tenantId,
            userId: u.id,
            campaignId: args.campaignId,
            sentAt: new Date(),
          };
          await db.insert(emailCampaignLogs).values(insertLog);

          sent += 1;
          logs.push(`Sent ${args.campaignId} to ${u.email}`);
        } catch (err) {
          errors.push(
            `Failed ${args.campaignId} for userId=${u.id} email=${u.email}: ${stringifyError(err)}`
          );
        }
      }
    },
  });

  return {
    logs,
    errors,
    stats: { attempted, sent, skipped, failed: errors.length },
  };
}

// ... imports and helper functions remain ...

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

async function runWelcomeCampaign(context: { logs: string[]; errors: string[]; stats: any }) {
  const campaignId = 'welcome_day_0';
  const now = new Date();
  let afterId: string | null = null;

  while (true) {
    const batch = await db.query.subscriptions.findMany({
      where: (subscriptions, { eq, and, gt }) =>
        and(
          eq(subscriptions.status, 'active'),
          gt(subscriptions.createdAt, subDays(now, 1)),
          afterId ? gt(subscriptions.id, afterId) : undefined
        ),
      orderBy: (subscriptions, { asc }) => [asc(subscriptions.id)],
      limit: USER_BATCH_SIZE,
      with: { user: true },
    });

    if (batch.length === 0) break;

    const userIds = Array.from(new Set(batch.map(s => s.userId)));
    const alreadySentSet = await getAlreadySentUserIdSet({ campaignId, userIds });

    for (const sub of batch) {
      const resolvedTenantId = sub.tenantId ?? sub.user?.tenantId;
      if (!resolvedTenantId) {
        context.stats.skipped += 1;
        context.errors.push(
          `Missing tenantId for subscription ${sub.id} userId=${sub.userId} email=${sub.user?.email ?? 'n/a'}`
        );
        continue;
      }

      if (alreadySentSet.has(sub.userId)) {
        context.stats.skipped += 1;
        continue;
      }

      context.stats.attempted += 1;
      const email = sub.user?.email;

      if (!email) {
        context.stats.skipped += 1;
        continue;
      }

      try {
        await withRetries(() => sendWelcomeEmail(email, sub.user!.name));
        await db.insert(emailCampaignLogs).values({
          id: `ecl_${nanoid()}`,
          tenantId: resolvedTenantId,
          userId: sub.userId,
          campaignId,
          sentAt: new Date(),
        });
        context.stats.sent += 1;
        context.logs.push(`Sent ${campaignId} to ${email}`);
      } catch (err) {
        context.stats.failed += 1;
        context.errors.push(
          `Failed ${campaignId} for userId=${sub.userId} email=${email}: ${stringifyError(err)}`
        );
      }
    }
    afterId = batch[batch.length - 1].id;
  }
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

async function processStandardUserCampaign(
  campaignId: string,
  windowStart: Date,
  windowEnd: Date,
  context: { logs: string[]; errors: string[]; stats: any },
  sendFn: (u: UserMini) => Promise<void>
) {
  let afterId: string | null = null;
  while (true) {
    const batch = await db.query.user.findMany({
      where: (user, { between, and, gt }) =>
        and(
          between(user.createdAt, windowStart, windowEnd),
          afterId ? gt(user.id, afterId as string) : undefined
        ),
      orderBy: (user, { asc }) => [asc(user.id)],
      limit: USER_BATCH_SIZE,
    });

    if (batch.length === 0) break;

    const userIds = batch.map(u => u.id);
    const alreadySentSet = await getAlreadySentUserIdSet({ campaignId, userIds });

    for (const u of batch) {
      if (!u.tenantId) {
        context.stats.skipped += 1;
        context.errors.push(`Missing tenantId for userId=${u.id} email=${u.email ?? 'n/a'}`);
        continue;
      }

      if (alreadySentSet.has(u.id)) {
        context.stats.skipped += 1;
        continue;
      }

      context.stats.attempted += 1;
      if (!u.email) {
        context.stats.skipped += 1;
        continue;
      }

      try {
        await sendFn({ id: u.id, email: u.email, name: u.name, tenantId: u.tenantId });
        await db.insert(emailCampaignLogs).values({
          id: `ecl_${nanoid()}`,
          tenantId: u.tenantId,
          userId: u.id,
          campaignId,
          sentAt: new Date(),
        });
        context.stats.sent += 1;
        context.logs.push(`Sent ${campaignId} to ${u.email}`);
      } catch (err) {
        context.stats.failed += 1;
        context.errors.push(
          `Failed ${campaignId} for userId=${u.id} email=${u.email}: ${stringifyError(err)}`
        );
      }
    }
    afterId = batch[batch.length - 1].id;
  }
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
