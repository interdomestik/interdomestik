import { db, inArray } from '@interdomestik/database';
import { emailCampaignLogs } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const USER_BATCH_SIZE = 500;
export const DEFAULT_RETRY_ATTEMPTS = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 250;
export const DEFAULT_MAX_BATCHES = 100_000;

export type UserMini = {
  id: string;
  email: string | null;
  name: string | null;
  tenantId: string | null;
};

function dedupeKeyForUser(user: Pick<UserMini, 'id' | 'tenantId'>): string | null {
  return user.tenantId ? `${user.tenantId}:${user.id}` : null;
}

function groupUserIdsByTenant(users: Pick<UserMini, 'id' | 'tenantId'>[]) {
  const groups = new Map<string, string[]>();
  for (const user of users) {
    if (!user.tenantId) continue;
    const existing = groups.get(user.tenantId) ?? [];
    existing.push(user.id);
    groups.set(user.tenantId, existing);
  }
  return groups;
}

export function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

export function stringifyError(err: unknown) {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export async function withRetries<T>(
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

export async function getAlreadySentUserIdSet(args: {
  campaignId: string;
  users: Pick<UserMini, 'id' | 'tenantId'>[];
}): Promise<Set<string>> {
  if (args.users.length === 0) return new Set();

  const sent = new Set<string>();
  for (const [tenantId, userIds] of groupUserIdsByTenant(args.users)) {
    const tenantRows = await db.query.emailCampaignLogs.findMany({
      where: and(
        eq(emailCampaignLogs.tenantId, tenantId),
        eq(emailCampaignLogs.campaignId, args.campaignId),
        inArray(emailCampaignLogs.userId, userIds)
      ),
    });
    for (const row of tenantRows) {
      sent.add(`${row.tenantId}:${row.userId}`);
    }
  }

  return sent;
}

export async function getUsersBatch(args: {
  afterId: string | null;
  limit?: number;
}): Promise<UserMini[]> {
  const limit = args.limit ?? USER_BATCH_SIZE;

  // Cursor pagination by primary key keeps memory stable and avoids huge offsets.
  // db-access-guard: system-exempt -- reason: campaign job enumerates tenants before per-row checks
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
    const lastId = batch.at(-1)?.id;
    afterId = lastId ?? afterId;
    await args.onBatch(batch, afterId);
  }

  return { batches: Math.max(batches - 1, 0), totalUsers, lastAfterId: afterId };
}

export async function processCampaignUser(
  u: UserMini,
  args: {
    campaignId: string;
    sendToUser: (u: UserMini) => Promise<void>;
  },
  alreadySentSet: Set<string>,
  stats: { attempted: number; sent: number; skipped: number },
  logs: string[],
  errors: string[]
) {
  stats.attempted += 1;

  if (!u.tenantId) {
    stats.skipped += 1;
    errors.push(`Missing tenantId for userId=${u.id} email=${u.email ?? 'n/a'}`);
    return;
  }

  if (!u.email) {
    stats.skipped += 1;
    return;
  }

  const dedupeKey = dedupeKeyForUser(u);
  if (dedupeKey && alreadySentSet.has(dedupeKey)) {
    stats.skipped += 1;
    return;
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
    // db-access-guard: tenant-scoped -- reason: tenantId from campaign user row
    await db.insert(emailCampaignLogs).values(insertLog);

    stats.sent += 1;
    logs.push(`Sent ${args.campaignId} to ${u.email}`);
  } catch (err) {
    errors.push(
      `Failed ${args.campaignId} for userId=${u.id} email=${u.email}: ${stringifyError(err)}`
    );
  }
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
  const stats = { attempted: 0, sent: 0, skipped: 0 };

  await forEachBatchedUsers({
    fetchBatch: afterId => getUsersBatch({ afterId, limit: USER_BATCH_SIZE }),
    onBatch: async batch => {
      const alreadySentSet = await getAlreadySentUserIdSet({
        campaignId: args.campaignId,
        users: batch,
      });

      for (const u of batch) {
        await processCampaignUser(u, args, alreadySentSet, stats, logs, errors);
      }
    },
  });

  return {
    logs,
    errors,
    stats: { ...stats, failed: errors.length },
  };
}

export function shouldSkipUser(
  u: UserMini,
  alreadySentSet: Set<string>,
  stats: { skipped: number },
  errors: string[]
): boolean {
  if (!u.tenantId) {
    stats.skipped += 1;
    errors.push(`Missing tenantId for userId=${u.id} email=${u.email ?? 'n/a'}`);
    return true;
  }

  const dedupeKey = dedupeKeyForUser(u);
  if (dedupeKey && alreadySentSet.has(dedupeKey)) {
    stats.skipped += 1;
    return true;
  }

  if (!u.email) {
    stats.skipped += 1;
    return true;
  }

  return false;
}

export async function executeCampaign<
  T extends { id: string; userId: string; tenantId?: string | null },
>(
  campaignId: string,
  fetchBatch: (afterId: string | null) => Promise<T[]>,
  processItem: (item: T) => Promise<void>,
  context: { logs: string[]; errors: string[]; stats: any }
) {
  let afterId: string | null = null;
  while (true) {
    const batch = await fetchBatch(afterId);
    if (batch.length === 0) break;

    const alreadySentSet = await getAlreadySentUserIdSet({
      campaignId,
      users: batch.map(item => ({
        id: item.userId,
        tenantId: item.tenantId ?? (item as any).user?.tenantId ?? null,
      })),
    });

    for (const item of batch) {
      // Basic validation mapped to generic structure
      const userMini: UserMini = {
        id: item.userId,
        email: (item as any).user?.email ?? (item as any).email, // flexible check
        name: (item as any).user?.name ?? (item as any).name,
        tenantId: item.tenantId ?? (item as any).user?.tenantId,
      };

      if (shouldSkipUser(userMini, alreadySentSet, context.stats, context.errors)) {
        continue;
      }

      context.stats.attempted += 1;

      try {
        await processItem(item);

        // db-access-guard: tenant-scoped -- reason: tenantId from campaign item row
        await db.insert(emailCampaignLogs).values({
          id: `ecl_${nanoid()}`,
          tenantId: userMini.tenantId!,
          userId: userMini.id,
          campaignId,
          sentAt: new Date(),
        });
        context.stats.sent += 1;
        context.logs.push(`Sent ${campaignId} to ${userMini.email}`);
      } catch (err) {
        context.stats.failed += 1;
        context.errors.push(
          `Failed ${campaignId} for userId=${userMini.id} email=${userMini.email}: ${stringifyError(err)}`
        );
      }
    }
    afterId = batch.at(-1)!.id;
  }
}

export async function processStandardUserCampaign(
  campaignId: string,
  windowStart: Date,
  windowEnd: Date,
  context: { logs: string[]; errors: string[]; stats: any },
  sendFn: (u: UserMini) => Promise<void>
) {
  await executeCampaign(
    campaignId,
    async afterId => {
      // db-access-guard: system-exempt -- reason: campaign lifecycle job enumerates tenants before per-row checks
      const users = await db.query.user.findMany({
        where: (user, { between, and, gt }) =>
          and(
            between(user.createdAt, windowStart, windowEnd),
            afterId ? gt(user.id, afterId) : undefined
          ),
        orderBy: (user, { asc }) => [asc(user.id)],
        limit: USER_BATCH_SIZE,
      });
      // Map to satisfy generic constraint { userId: string, ... }
      return users.map(u => ({ ...u, userId: u.id }));
    },
    async u => {
      // u has userId due to mapping above, but sendFn expects UserMini (id, email, etc)
      // We can reconstruct UserMini or pass u if it matches enough.
      // UserMini requires: id, email, name, tenantId.
      // u has id, email, name, tenantId AND userId.
      await sendFn(u);
    },
    context
  );
}
