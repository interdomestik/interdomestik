import {
  and,
  desc,
  eq,
  inArray,
  sponsorRevisionDecisions,
  sponsorRosterEntries,
  sponsors,
  sponsorTermRevisions,
  sponsorTerms,
  sql,
  user,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { nanoid } from 'nanoid';

import { parseTimestamp } from '../sponsor-coverage/resolve';
import { canManageRoster, type SponsorActor } from './access';
import {
  normalizeRosterEmail,
  optOutToken,
  optOutTokenHash,
  rosterEmailHmac,
} from './roster-crypto';
import type { SponsorResult } from './terms';

export const MAX_UPLOAD_ROWS = 500;

export type RosterRow = { firstName: string; lastName: string; email: string };
export type PreparedRow = RosterRow & { emailNormalized: string; emailHmac: string };

/** Normalizes, validates and deduplicates rows, then orders them by HMAC (§3.5). */
export function prepareRosterRows(
  rows: readonly RosterRow[],
  secret: string
): { rows: PreparedRow[]; invalid: number; duplicates: number } | null {
  if (rows.length > MAX_UPLOAD_ROWS) return null;
  const seen = new Map<string, PreparedRow>();
  let invalid = 0;
  for (const row of rows) {
    const email = normalizeRosterEmail(row.email);
    const firstName = row.firstName.trim();
    const lastName = row.lastName.trim();
    if (!email || !firstName || !lastName) {
      invalid += 1;
      continue;
    }
    if (!seen.has(email)) {
      seen.set(email, {
        firstName,
        lastName,
        email,
        emailNormalized: email,
        emailHmac: rosterEmailHmac(secret, email),
      });
    }
  }
  const prepared = [...seen.values()].sort((a, b) => a.emailHmac.localeCompare(b.emailHmac));
  return { rows: prepared, invalid, duplicates: rows.length - invalid - prepared.length };
}

export type UploadSummary = {
  inserted: number;
  bound: number;
  alreadyListed: number;
  invalid: number;
  duplicates: number;
};

/**
 * Inserts a list into an effective term under `sponsors FOR UPDATE` → `sponsor_terms FOR UPDATE`,
 * capped at the effective seat count. An entry is bound at insert only to the one tenant user
 * whose current address matches, who was bound in an earlier term of the same sponsor. Binding
 * reads without locks and admits nothing; admission decides conflicts later (§3.5, §3.6.1).
 */
export async function uploadRoster(
  authority: TenantAuthority,
  actor: SponsorActor,
  input: { termId: string; rows: readonly RosterRow[]; secret: string }
): Promise<SponsorResult<UploadSummary>> {
  const { tenantId } = readTenantAuthority(authority);
  const prepared = prepareRosterRows(input.rows, input.secret);
  if (!prepared) return { ok: false, error: 'invalid' };
  return withTenantAuthority(authority, async tx => {
    const [term] = await tx
      .select({
        sponsorId: sponsorTerms.sponsorId,
        termStart: sponsorTerms.termStart,
        termEnd: sponsorTerms.termEnd,
      })
      .from(sponsorTerms)
      .where(and(eq(sponsorTerms.tenantId, tenantId), eq(sponsorTerms.id, input.termId)));
    if (!term) return { ok: false, error: 'not_found' };
    const [sponsor] = await tx
      .select({ branchId: sponsors.branchId, createdBy: sponsors.createdBy })
      .from(sponsors)
      .where(and(eq(sponsors.tenantId, tenantId), eq(sponsors.id, term.sponsorId)))
      .for('update');
    if (!sponsor) return { ok: false, error: 'not_found' };
    await tx
      .select({ id: sponsorTerms.id })
      .from(sponsorTerms)
      .where(and(eq(sponsorTerms.tenantId, tenantId), eq(sponsorTerms.id, input.termId)))
      .for('update');
    const [effective] = await tx
      .select({ seatCount: sponsorTermRevisions.seatCount })
      .from(sponsorTermRevisions)
      .innerJoin(
        sponsorRevisionDecisions,
        and(
          eq(sponsorRevisionDecisions.tenantId, sponsorTermRevisions.tenantId),
          eq(sponsorRevisionDecisions.revisionId, sponsorTermRevisions.id),
          eq(sponsorRevisionDecisions.decision, 'approved')
        )
      )
      .where(
        and(
          eq(sponsorTermRevisions.tenantId, tenantId),
          eq(sponsorTermRevisions.termId, input.termId)
        )
      )
      .orderBy(desc(sponsorTermRevisions.revision))
      .limit(1);
    const scope = { ownerAgentId: sponsor.createdBy, branchId: sponsor.branchId };
    if (!canManageRoster(actor, scope, effective !== undefined)) {
      return { ok: false, error: 'forbidden' };
    }
    const [{ listed } = { listed: 0 }] = await tx
      .select({ listed: sql<number>`count(*)::int` })
      .from(sponsorRosterEntries)
      .where(
        and(
          eq(sponsorRosterEntries.tenantId, tenantId),
          eq(sponsorRosterEntries.termId, input.termId)
        )
      );
    const existing = await tx
      .select({ hmac: sponsorRosterEntries.emailHmac })
      .from(sponsorRosterEntries)
      .where(
        and(
          eq(sponsorRosterEntries.tenantId, tenantId),
          eq(sponsorRosterEntries.termId, input.termId),
          inArray(
            sponsorRosterEntries.emailHmac,
            prepared.rows.map(row => row.emailHmac)
          )
        )
      );
    const already = new Set(existing.map(row => row.hmac));
    const fresh = prepared.rows.filter(row => !already.has(row.emailHmac));
    if (effective && listed + fresh.length > effective.seatCount) {
      return { ok: false, error: 'conflict' };
    }
    const binding = await bindableUsers(tx, tenantId, term, fresh);
    if (fresh.length > 0) {
      await tx.insert(sponsorRosterEntries).values(
        fresh.map(row => {
          const id = `spe_${nanoid()}`;
          return {
            id,
            tenantId,
            termId: input.termId,
            firstName: row.firstName,
            lastName: row.lastName,
            emailNormalized: row.emailNormalized,
            emailHmac: row.emailHmac,
            userId: binding.get(row.emailNormalized) ?? null,
            addedBy: actor.userId,
            // The token is derived, never stored; its hash is written once here (it may only be
            // cleared later, §3.8).
            optoutTokenHash: optOutTokenHash(optOutToken(input.secret, id)),
          };
        })
      );
    }
    return {
      ok: true,
      value: {
        inserted: fresh.length,
        bound: fresh.filter(row => binding.has(row.emailNormalized)).length,
        alreadyListed: prepared.rows.length - fresh.length,
        invalid: prepared.invalid,
        duplicates: prepared.duplicates,
      },
    };
  });
}

type Tx = Parameters<Parameters<typeof withTenantAuthority>[1]>[0];

/** Address → user id for rows that may be bound at insert (a first filter only, §3.5). */
async function bindableUsers(
  tx: Tx,
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
    if (row.sponsorId !== term.sponsorId && row.decision === 'accepted') {
      const occupied = parseTimestamp(row.revokedAt ?? row.terminatedEffectiveAt ?? row.termEnd);
      if (rowStart < end && start < occupied) blocked.add(row.userId);
    }
  }
  return new Map(
    unique
      .filter(item => eligible.has(item.userId) && !blocked.has(item.userId))
      .map(item => [item.email, item.userId])
  );
}
