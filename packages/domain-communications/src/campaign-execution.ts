import { inArray, listScheduledTenantWork } from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import { emailCampaignLogs } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { stringifyError } from './campaign-retry';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { forEachInOrder } from './in-order';

export {
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_RETRY_BASE_DELAY_MS,
  sleep,
  stringifyError,
  withRetries,
} from './campaign-retry';

export const USER_BATCH_SIZE = 500;
export const DEFAULT_MAX_BATCHES = 100_000;

export type UserMini = {
  id: string;
  email: string | null;
  name: string | null;
  tenantId: string | null;
};

type CampaignExecutionItem = {
  id: string;
  userId: string;
  tenantId?: string | null;
  user?: Pick<UserMini, 'email' | 'name' | 'tenantId'> | null;
  email?: string | null;
  name?: string | null;
};

function tenantMismatchMessage(userId: string, itemTenantId: string, authorityTenantId: string) {
  return `Tenant mismatch for userId=${userId}: item tenant ${itemTenantId} is outside run tenant ${authorityTenantId}`;
}

function dedupeKeyForUser(user: Pick<UserMini, 'id' | 'tenantId'>): string | null {
  return user.tenantId ? `${user.tenantId}:${user.id}` : null;
}

export async function getAlreadySentUserIdSet(args: {
  authority: TenantAuthority;
  campaignId: string;
  users: Pick<UserMini, 'id' | 'tenantId'>[];
}): Promise<Set<string>> {
  const { tenantId } = readTenantAuthority(args.authority);
  // Users of any other tenant are excluded from the query; they are never written under this authority.
  const userIds = args.users.filter(user => user.tenantId === tenantId).map(user => user.id);
  if (userIds.length === 0) return new Set();

  const rows = await withTenantAuthority(args.authority, tx =>
    tx.query.emailCampaignLogs.findMany({
      where: and(
        eq(emailCampaignLogs.campaignId, args.campaignId),
        eq(emailCampaignLogs.tenantId, tenantId),
        inArray(emailCampaignLogs.userId, userIds)
      ),
    })
  );

  const sent = new Set<string>();
  for (const row of rows) {
    sent.add(`${row.tenantId}:${row.userId}`);
  }

  return sent;
}

export async function getUsersBatch(args: {
  authority: TenantAuthority;
  afterId: string | null;
  limit?: number;
}): Promise<UserMini[]> {
  const limit = args.limit ?? USER_BATCH_SIZE;
  const { afterId } = args;
  const { tenantId } = readTenantAuthority(args.authority);

  // Cursor pagination by primary key keeps memory stable and avoids huge offsets; one tenant per cursor.
  const users = await withTenantAuthority(args.authority, tx =>
    tx.query.user.findMany({
      where: (user, { and, eq, gt }) =>
        and(eq(user.tenantId, tenantId), afterId ? gt(user.id, afterId) : undefined),
      orderBy: (user, { asc }) => [asc(user.id)],
      limit,
      columns: {
        id: true,
        email: true,
        name: true,
        tenantId: true,
      },
    })
  );

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
    sendToUser: (u: UserMini, authority: TenantAuthority) => Promise<void>;
  },
  authority: TenantAuthority,
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
  const { tenantId } = readTenantAuthority(authority);
  if (u.tenantId !== tenantId) {
    stats.skipped += 1;
    errors.push(tenantMismatchMessage(u.id, u.tenantId, tenantId));
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
    await args.sendToUser(u, authority);

    const insertLog = {
      id: `ecl_${nanoid()}`,
      tenantId,
      userId: u.id,
      campaignId: args.campaignId,
      sentAt: new Date(),
    };
    await withTenantAuthority(authority, async tx => {
      await tx.insert(emailCampaignLogs).values(insertLog);
    });

    stats.sent += 1;
    logs.push(`Sent ${args.campaignId} to ${u.email}`);
  } catch (err) {
    errors.push(
      `Failed ${args.campaignId} for userId=${u.id} email=${u.email}: ${stringifyError(err)}`
    );
  }
}

export async function processBatchedUserCampaign(args: {
  ingress: IngressCapability<'cron' | 'inngest'>;
  campaignId: string;
  sendToUser: (u: UserMini, authority: TenantAuthority) => Promise<void>;
}): Promise<{
  logs: string[];
  errors: string[];
  stats: { attempted: number; sent: number; skipped: number; failed: number };
}> {
  const logs: string[] = [];
  const errors: string[] = [];
  const stats = { attempted: 0, sent: 0, skipped: 0 };

  await forEachInOrder(await listScheduledTenantWork(args.ingress), async ({ authority }) => {
    await forEachBatchedUsers({
      fetchBatch: afterId => getUsersBatch({ authority, afterId, limit: USER_BATCH_SIZE }),
      onBatch: async batch => {
        const alreadySentSet = await getAlreadySentUserIdSet({
          authority,
          campaignId: args.campaignId,
          users: batch,
        });

        await forEachInOrder(batch, async u => {
          await processCampaignUser(u, args, authority, alreadySentSet, stats, logs, errors);
        });
      },
    });
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

export async function executeCampaign<T extends CampaignExecutionItem>(
  campaignId: string,
  authority: TenantAuthority,
  fetchBatch: (afterId: string | null) => Promise<T[]>,
  processItem: (item: T) => Promise<void>,
  context: { logs: string[]; errors: string[]; stats: any }
) {
  const { tenantId: authorityTenantId } = readTenantAuthority(authority);
  let afterId: string | null = null;
  while (true) {
    const batch = await fetchBatch(afterId);
    if (batch.length === 0) break;

    const alreadySentSet = await getAlreadySentUserIdSet({
      authority,
      campaignId,
      users: batch.map(item => ({
        id: item.userId,
        tenantId: item.tenantId ?? item.user?.tenantId ?? null,
      })),
    });

    await forEachInOrder(batch, async item => {
      const userMini: UserMini = {
        id: item.userId,
        email: item.user?.email ?? item.email ?? null,
        name: item.user?.name ?? item.name ?? null,
        tenantId: item.tenantId ?? item.user?.tenantId ?? null,
      };

      if (userMini.tenantId && userMini.tenantId !== authorityTenantId) {
        context.stats.skipped += 1;
        context.errors.push(
          tenantMismatchMessage(userMini.id, userMini.tenantId, authorityTenantId)
        );
        return;
      }
      if (shouldSkipUser(userMini, alreadySentSet, context.stats, context.errors)) {
        return;
      }

      context.stats.attempted += 1;

      try {
        await processItem(item);

        await withTenantAuthority(authority, async tx => {
          await tx.insert(emailCampaignLogs).values({
            id: `ecl_${nanoid()}`,
            tenantId: authorityTenantId,
            userId: userMini.id,
            campaignId,
            sentAt: new Date(),
          });
        });
        context.stats.sent += 1;
        context.logs.push(`Sent ${campaignId} to ${userMini.email}`);
      } catch (err) {
        context.stats.failed += 1;
        context.errors.push(
          `Failed ${campaignId} for userId=${userMini.id} email=${userMini.email}: ${stringifyError(err)}`
        );
      }
    });
    afterId = batch.at(-1)!.id;
  }
}

export async function processStandardUserCampaign(
  ingress: IngressCapability<'cron' | 'inngest'>,
  campaignId: string,
  windowStart: Date,
  windowEnd: Date,
  context: { logs: string[]; errors: string[]; stats: any },
  sendFn: (u: UserMini) => Promise<void>
) {
  await forEachInOrder(await listScheduledTenantWork(ingress), async ({ authority }) => {
    const { tenantId } = readTenantAuthority(authority);
    await executeCampaign(
      campaignId,
      authority,
      async afterId => {
        const users = await withTenantAuthority(authority, tx =>
          tx.query.user.findMany({
            where: (user, { between, and, eq, gt }) =>
              and(
                eq(user.tenantId, tenantId),
                between(user.createdAt, windowStart, windowEnd),
                afterId ? gt(user.id, afterId) : undefined
              ),
            orderBy: (user, { asc }) => [asc(user.id)],
            limit: USER_BATCH_SIZE,
          })
        );
        return users.map(u => ({ ...u, userId: u.id }));
      },
      async u => {
        await sendFn(u);
      },
      context
    );
  });
}
