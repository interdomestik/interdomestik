import {
  and,
  asc,
  eq,
  isNull,
  sponsorRosterEntries,
  sponsorTerms,
  sql,
  type TenantTransaction,
} from '@interdomestik/database';
import { gt } from 'drizzle-orm';

/**
 * The member's own entries that leave would revoke: not revoked and in a term that has not ended,
 * so a pending handover or a future start can be left before coverage begins (§3.4).
 */
export async function listLeavableSponsorEntries(
  tx: TenantTransaction,
  tenantId: string,
  userId: string,
  now: Date
): Promise<string[]> {
  const rows = await tx
    .select({ id: sponsorRosterEntries.id })
    .from(sponsorRosterEntries)
    .innerJoin(
      sponsorTerms,
      and(
        eq(sponsorTerms.tenantId, sponsorRosterEntries.tenantId),
        eq(sponsorTerms.id, sponsorRosterEntries.termId)
      )
    )
    .where(
      and(
        eq(sponsorRosterEntries.tenantId, tenantId),
        eq(sponsorRosterEntries.userId, userId),
        isNull(sponsorRosterEntries.revokedAt),
        gt(
          sql`coalesce(${sponsorTerms.terminatedEffectiveAt}, ${sponsorTerms.termEnd})`,
          now.toISOString()
        )
      )
    )
    .orderBy(asc(sponsorTerms.termStart), asc(sponsorRosterEntries.id));
  return rows.map(row => row.id);
}
