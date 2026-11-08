import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  resolveSponsorOptOutTenant,
  sponsorMailOutbox,
  sponsorRosterEntries,
  sponsorRevisionDecisions,
  sponsors,
  sponsorTermRevisions,
  sponsorTerms,
  sql,
  type TenantTransaction,
} from '@interdomestik/database';
import { lockSponsorEntryIdentity, lockSponsorPerson } from '@interdomestik/database/sponsor-locks';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { gt } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { canManageRoster, type SponsorActor } from './access';
import { SPONSOR_SYSTEM_ACTOR, writeSponsorAudit } from './audit';
import { optOutTokenHash } from './roster-crypto';
import type { SponsorResult } from './terms';

/**
 * ACQ-3b §3.7 opt-out (token) and leave (`/member/membership`): revoke the person's current and
 * future entries of that sponsor, clear their token hashes and queue one confirmation. A list
 * uploaded later is a new agreement with the company. Accounts are never deleted.
 */
type Revocation = {
  tenantId: string;
  entryId: string;
  reason: 'opted_out' | 'left';
  now: Date;
  /** Leave acts only on the signed-in member's own entries. */
  requireUserId: string | null;
};

async function revokeSponsorPerson(tx: TenantTransaction, input: Revocation): Promise<number> {
  const { tenantId, now } = input;
  const [target] = await tx
    .select({
      userId: sponsorRosterEntries.userId,
      emailHmac: sponsorRosterEntries.emailHmac,
      sponsorId: sponsorTerms.sponsorId,
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
      and(eq(sponsorRosterEntries.tenantId, tenantId), eq(sponsorRosterEntries.id, input.entryId))
    );
  if (!target) return 0;
  if (input.requireUserId !== null && target.userId !== input.requireUserId) return 0;

  // §3.5: lock 1 for an unbound person, otherwise lock 2; then terms FOR SHARE, entries FOR UPDATE.
  if (target.userId) await lockSponsorPerson(tx, target.userId);
  else if (target.emailHmac) await lockSponsorEntryIdentity(tx, target.emailHmac);
  else return 0;
  const sponsorTermIds = tx
    .select({ id: sponsorTerms.id })
    .from(sponsorTerms)
    .where(and(eq(sponsorTerms.tenantId, tenantId), eq(sponsorTerms.sponsorId, target.sponsorId)));
  const terms = await tx
    .select({ id: sponsorTerms.id })
    .from(sponsorTerms)
    .where(and(eq(sponsorTerms.tenantId, tenantId), inArray(sponsorTerms.id, sponsorTermIds)))
    .orderBy(asc(sponsorTerms.id))
    .for('share');
  const person = target.userId
    ? eq(sponsorRosterEntries.userId, target.userId)
    : and(
        isNull(sponsorRosterEntries.userId),
        eq(sponsorRosterEntries.emailHmac, target.emailHmac ?? '')
      );
  const entries = await tx
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
        person,
        inArray(
          sponsorRosterEntries.termId,
          terms.map(term => term.id)
        ),
        isNull(sponsorRosterEntries.revokedAt),
        // Current and future entries only: a past entry keeps its history.
        gt(
          sql`coalesce(${sponsorTerms.terminatedEffectiveAt}, ${sponsorTerms.termEnd})`,
          now.toISOString()
        )
      )
    )
    .orderBy(asc(sponsorRosterEntries.id))
    .for('update');
  if (entries.length === 0) return 0;
  const ids = entries.map(entry => entry.id);
  await tx
    .update(sponsorRosterEntries)
    .set({
      revokedAt: now.toISOString(),
      revokedReason: input.reason,
      optedOutAt: now.toISOString(),
      optoutTokenHash: null,
    })
    .where(and(eq(sponsorRosterEntries.tenantId, tenantId), inArray(sponsorRosterEntries.id, ids)));
  await writeSponsorAudit(
    tx,
    tenantId,
    ids.map(entityId => ({
      action: input.reason === 'opted_out' ? 'sponsor_entry.opted_out' : 'sponsor_entry.revoked',
      entityType: 'sponsor_roster_entry',
      entityId,
      ...(input.reason === 'opted_out'
        ? SPONSOR_SYSTEM_ACTOR
        : { actorId: input.requireUserId, actorRole: 'member' }),
      metadata: { reason: input.reason },
    }))
  );
  await tx
    .insert(sponsorMailOutbox)
    .values({
      id: nanoid(),
      tenantId,
      rosterEntryId: input.entryId,
      kind: 'opt_out_confirmation',
      idempotencyKey: `sponsor-entry:${input.entryId}:opt_out_confirmation`,
    })
    .onConflictDoNothing({ target: sponsorMailOutbox.idempotencyKey });
  return ids.length;
}

/** The public opt-out link. An unknown, cleared or ambiguous token changes nothing. */
export async function optOutByToken(
  token: string,
  now: Date
): Promise<{ ok: true; revoked: number } | { ok: false }> {
  if (!token || token.length > 200) return { ok: false };
  const resolved = await resolveSponsorOptOutTenant(optOutTokenHash(token));
  if (!resolved) return { ok: false };
  const revoked = await withTenantAuthority(resolved.authority, tx =>
    revokeSponsorPerson(tx, {
      tenantId: resolved.tenantId,
      entryId: resolved.entryId,
      reason: 'opted_out',
      now,
      requireUserId: null,
    })
  );
  return { ok: true, revoked };
}

/** "Leave" on the member's own membership page: only the signed-in member's own entries. */
export async function leaveSponsorship(
  authority: TenantAuthority,
  member: { userId: string },
  input: { entryId: string; now: Date }
): Promise<SponsorResult<{ revoked: number }>> {
  const { tenantId } = readTenantAuthority(authority);
  const revoked = await withTenantAuthority(authority, tx =>
    revokeSponsorPerson(tx, {
      tenantId,
      entryId: input.entryId,
      reason: 'left',
      now: input.now,
      requireUserId: member.userId,
    })
  );
  return revoked > 0 ? { ok: true, value: { revoked } } : { ok: false, error: 'not_found' };
}

/** §2: "left the company" is information only; it never ends or blocks a seat. */
export async function markLeftCompany(
  authority: TenantAuthority,
  actor: SponsorActor,
  input: { entryId: string; now: Date }
): Promise<SponsorResult<{ marked: boolean }>> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    const [row] = await tx
      .select({
        termId: sponsorTerms.id,
        branchId: sponsors.branchId,
        createdBy: sponsors.createdBy,
      })
      .from(sponsorRosterEntries)
      .innerJoin(
        sponsorTerms,
        and(
          eq(sponsorTerms.tenantId, sponsorRosterEntries.tenantId),
          eq(sponsorTerms.id, sponsorRosterEntries.termId)
        )
      )
      .innerJoin(
        sponsors,
        and(eq(sponsors.tenantId, sponsorTerms.tenantId), eq(sponsors.id, sponsorTerms.sponsorId))
      )
      .where(
        and(eq(sponsorRosterEntries.tenantId, tenantId), eq(sponsorRosterEntries.id, input.entryId))
      );
    if (!row) return { ok: false, error: 'not_found' };
    const [approved] = await tx
      .select({ id: sponsorRevisionDecisions.id })
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
          eq(sponsorTermRevisions.termId, row.termId)
        )
      )
      .limit(1);
    const scope = { ownerAgentId: row.createdBy, branchId: row.branchId };
    if (!canManageRoster(actor, scope, approved !== undefined)) {
      return { ok: false, error: 'forbidden' };
    }
    const updated = await tx
      .update(sponsorRosterEntries)
      .set({ leftCompanyAt: input.now.toISOString() })
      .where(
        and(
          eq(sponsorRosterEntries.tenantId, tenantId),
          eq(sponsorRosterEntries.id, input.entryId),
          isNull(sponsorRosterEntries.leftCompanyAt)
        )
      )
      .returning({ id: sponsorRosterEntries.id });
    if (updated.length > 0) {
      await writeSponsorAudit(tx, tenantId, [
        {
          action: 'sponsor_roster.left_company',
          entityType: 'sponsor_roster_entry',
          entityId: input.entryId,
          actorId: actor.userId,
          actorRole: actor.role,
          metadata: { at: input.now.toISOString() },
        },
      ]);
    }
    return { ok: true, value: { marked: updated.length > 0 } };
  });
}
