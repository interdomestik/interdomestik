import {
  and,
  eq,
  inArray,
  sponsorRosterEntries,
  sponsorTerms,
  sql,
  user,
  type TenantTransaction,
} from '@interdomestik/database';
import { parseTimestamp } from '../sponsor-coverage/resolve';
import type { PreparedRow } from './roster-upload';

/** Address → user id for rows that may be bound at insert (a first filter only, §3.5). */
export async function bindableUsers(
  tx: TenantTransaction,
  tenantId: string,
  term: { sponsorId: string; termStart: string; termEnd: string },
  rows: readonly PreparedRow[]
): Promise<Map<string, string>> {
  if (rows.length === 0) return new Map();
  const emails = rows.map(row => row.emailNormalized);
  const matches = await tx
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), inArray(sql`lower(btrim(${user.email}))`, emails)));
  const byEmail = new Map<string, string[]>();
  for (const match of matches) {
    const key = match.email.trim().toLowerCase();
    byEmail.set(key, [...(byEmail.get(key) ?? []), match.id]);
  }
  const unique = [...byEmail]
    .filter(([, ids]) => ids.length === 1)
    .map(([email, ids]) => ({ email, userId: ids[0] as string }));
  if (unique.length === 0) return new Map();
  const history = await tx
    .select({
      userId: sponsorRosterEntries.userId,
      sponsorId: sponsorTerms.sponsorId,
      termStart: sponsorTerms.termStart,
      termEnd: sponsorTerms.termEnd,
      terminatedEffectiveAt: sponsorTerms.terminatedEffectiveAt,
      decision: sponsorRosterEntries.conflictDecision,
      revokedAt: sponsorRosterEntries.revokedAt,
    })
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
        inArray(
          sponsorRosterEntries.userId,
          unique.map(item => item.userId)
        )
      )
    );
  const start = parseTimestamp(term.termStart);
  const end = parseTimestamp(term.termEnd);
  const eligible = new Set<string>();
  const blocked = new Set<string>();
  for (const row of history) {
    if (!row.userId) continue;
    const rowStart = parseTimestamp(row.termStart);
    if (row.sponsorId === term.sponsorId && rowStart < start) eligible.add(row.userId);
    if (blocksBinding(row, term.sponsorId, start, end)) blocked.add(row.userId);
  }
  return new Map(
    unique
      .filter(item => eligible.has(item.userId) && !blocked.has(item.userId))
      .map(item => [item.email, item.userId])
  );
}

function blocksBinding(
  row: {
    sponsorId: string;
    decision: string | null;
    termStart: string;
    termEnd: string;
    revokedAt: string | null;
    terminatedEffectiveAt: string | null;
  },
  sponsorId: string,
  start: Date,
  end: Date
): boolean {
  if (row.sponsorId === sponsorId || row.decision !== 'accepted') return false;
  const occupied = parseTimestamp(row.revokedAt ?? row.terminatedEffectiveAt ?? row.termEnd);
  return parseTimestamp(row.termStart) < end && start < occupied;
}
