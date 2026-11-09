import {
  and,
  eq,
  inArray,
  sponsorRosterEntries,
  sponsorTerms,
  subscriptions,
  user,
} from '@interdomestik/database';
import { lockSponsorPerson } from '@interdomestik/database/sponsor-locks';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { ne, sql, type SQL } from 'drizzle-orm';

import { resolveEffectiveMembership } from '../sponsor-coverage/resolve';

type CacheRow = Pick<typeof subscriptions.$inferSelect, 'id' | 'userId' | 'provider' | 'status'>;
type CoverageSource = { userId: string; membership: { source: string } };
export type CacheStatusChange = { id: string; status: 'active' | 'canceled' };
export type CacheJobSummary = { processed: number; updated: number };

/** Suppress the schema's automatic updatedAt hook: the cached status is the only changed value. */
export function cacheStatusValues(status: CacheStatusChange['status']): {
  status: CacheStatusChange['status'];
  updatedAt: SQL;
} {
  return { status, updatedAt: sql`${subscriptions.updatedAt}` };
}

/** Only resolver source 1 can make this display cache active; no other provider is writable. */
export function planCacheStatuses(
  rows: readonly CacheRow[],
  covered: readonly CoverageSource[]
): CacheStatusChange[] {
  const sponsored = new Set(
    covered.filter(row => row.membership.source === 'sponsor').map(row => row.userId)
  );
  return rows.flatMap(row => {
    if (row.provider !== 'group_sponsor') return [];
    const status = sponsored.has(row.userId) ? 'active' : 'canceled';
    return row.status === status ? [] : [{ id: row.id, status }];
  });
}

/** §3.7: one transaction per person, sequenced without capturing a live tenant transaction. */
export async function runSponsorCacheJob(
  authority: TenantAuthority,
  { now }: { now: Date }
): Promise<CacheJobSummary> {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid cache job date');
  const { tenantId } = readTenantAuthority(authority);
  const candidates = await withTenantAuthority(authority, tx =>
    tx
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.provider, 'group_sponsor')))
      .orderBy(subscriptions.userId)
  );
  return candidates.reduce<Promise<CacheJobSummary>>(
    (previous, candidate) =>
      previous.then(async summary => {
        const result = await refreshPersonCache(authority, candidate.userId, now);
        return {
          processed: summary.processed + result.processed,
          updated: summary.updated + result.updated,
        };
      }),
    Promise.resolve({ processed: 0, updated: 0 })
  );
}

/** §3.5: person → terms → entries → user → subscription; the resolver itself takes no locks. */
async function refreshPersonCache(
  authority: TenantAuthority,
  userId: string,
  now: Date
): Promise<CacheJobSummary> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    await lockSponsorPerson(tx, userId);
    const personEntries = and(
      eq(sponsorRosterEntries.tenantId, tenantId),
      eq(sponsorRosterEntries.userId, userId)
    );
    const termIds = tx
      .select({ id: sponsorRosterEntries.termId })
      .from(sponsorRosterEntries)
      .where(personEntries);
    await tx
      .select({ id: sponsorTerms.id })
      .from(sponsorTerms)
      .where(and(eq(sponsorTerms.tenantId, tenantId), inArray(sponsorTerms.id, termIds)))
      .orderBy(sponsorTerms.id)
      .for('share');
    await tx
      .select({ id: sponsorRosterEntries.id })
      .from(sponsorRosterEntries)
      .where(personEntries)
      .orderBy(sponsorRosterEntries.id)
      .for('update');
    await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.id, userId)))
      .orderBy(user.id)
      .for('share');
    const rows = await tx
      .select({
        id: subscriptions.id,
        userId: subscriptions.userId,
        provider: subscriptions.provider,
        status: subscriptions.status,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.tenantId, tenantId),
          eq(subscriptions.provider, 'group_sponsor'),
          eq(subscriptions.userId, userId)
        )
      )
      .orderBy(subscriptions.id)
      .for('update');
    const membership = (await resolveEffectiveMembership(tx, tenantId, [userId], now)).get(userId);
    const covered = membership && membership.source !== 'none' ? [{ userId, membership }] : [];
    // subscriptions.user_id is unique; a provider change since discovery is excluded above.
    const [change] = planCacheStatuses(rows, covered);
    if (!change) return { processed: rows.length, updated: 0 };
    const written = await tx
      .update(subscriptions)
      .set(cacheStatusValues(change.status))
      .where(
        and(
          eq(subscriptions.tenantId, tenantId),
          eq(subscriptions.id, change.id),
          eq(subscriptions.provider, 'group_sponsor'),
          ne(subscriptions.status, change.status)
        )
      )
      .returning({ id: subscriptions.id });
    return { processed: rows.length, updated: written.length };
  });
}
