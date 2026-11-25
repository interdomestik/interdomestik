import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  memberLeads,
  or,
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
import { nanoid } from 'nanoid';

import { parseTimestamp } from '../sponsor-coverage/resolve';
import { canManageRoster, type SponsorActor } from './access';
import { SPONSOR_SYSTEM_ACTOR, writeSponsorAudit } from './audit';
import { sponsorOptOutExpired } from './retention-plan';
import { optOutTokenHash } from './roster-crypto';
import type { SponsorResult } from './terms';

export { listLeavableSponsorEntries } from './leavable-entries';

/**
 * ACQ-3b §3.7 opt-out (token) and leave (`/member/membership`): revoke the person's current and
 * future entries of that sponsor, record token consumption and queue one confirmation. A list
 * uploaded later is a new agreement with the company. Accounts are never deleted.
 */
type Revocation = {
  tenantId: string;
  entryId: string;
} & (
  | { reason: 'opted_out'; tokenHash: string; now?: Date }
  | { reason: 'left'; now: Date; requireUserId: string }
);
type RevocationResult = number | 'refused' | 'binding_changed';

function optOutConfirmationKey(entryId: string): string {
  return `sponsor-entry:${entryId}:opt_out_confirmation`;
}

async function revokeSponsorPerson(
  tx: TenantTransaction,
  input: Revocation
): Promise<RevocationResult> {
  const { tenantId, entryId } = input;
  const [target] = await tx
    .select({
      termId: sponsorRosterEntries.termId,
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
    .where(and(eq(sponsorRosterEntries.tenantId, tenantId), eq(sponsorRosterEntries.id, entryId)));
  if (!target || (input.reason === 'left' && target.userId !== input.requireUserId)) {
    return 'refused';
  }

  // §3.5: lock 1 for an unbound person, otherwise lock 2; then terms FOR SHARE, entries FOR UPDATE.
  if (target.userId) await lockSponsorPerson(tx, target.userId);
  else if (target.emailHmac) await lockSponsorEntryIdentity(tx, target.emailHmac);
  else return 'refused';
  const sponsorTermIds = tx
    .select({ id: sponsorTerms.id })
    .from(sponsorTerms)
    .where(and(eq(sponsorTerms.tenantId, tenantId), eq(sponsorTerms.sponsorId, target.sponsorId)));
  const terms = await tx
    .select({
      id: sponsorTerms.id,
      termEnd: sponsorTerms.termEnd,
      terminatedEffectiveAt: sponsorTerms.terminatedEffectiveAt,
    })
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
  const originTerm = terms.find(term => term.id === target.termId);
  if (!originTerm) return 'refused';
  // Include the exact origin even if it is past, revoked or has changed its identity binding.
  // Take all relevant entry locks in ID order, after taking the term locks.
  const entries = await tx
    .select({
      id: sponsorRosterEntries.id,
      termId: sponsorRosterEntries.termId,
      userId: sponsorRosterEntries.userId,
      emailHmac: sponsorRosterEntries.emailHmac,
      revokedAt: sponsorRosterEntries.revokedAt,
      optedOutAt: sponsorRosterEntries.optedOutAt,
      tokenHash: sponsorRosterEntries.optoutTokenHash,
    })
    .from(sponsorRosterEntries)
    .where(
      and(
        eq(sponsorRosterEntries.tenantId, tenantId),
        inArray(
          sponsorRosterEntries.termId,
          terms.map(term => term.id)
        ),
        or(
          eq(sponsorRosterEntries.id, entryId),
          and(person, isNull(sponsorRosterEntries.revokedAt))
        )
      )
    )
    .orderBy(asc(sponsorRosterEntries.id))
    .for('update');
  const origin = entries.find(entry => entry.id === entryId);
  if (origin?.termId !== originTerm.id) return 'refused';
  if (origin.userId !== target.userId || origin.emailHmac !== target.emailHmac) {
    return 'binding_changed';
  }
  if (input.reason === 'opted_out') {
    if (
      origin.tokenHash !== input.tokenHash ||
      origin.revokedAt !== null ||
      origin.optedOutAt !== null
    ) {
      return 'refused';
    }
    // Older builds queued the confirmation without marking an ended origin as consumed.
    const [priorConfirmation] = await tx
      .select({ id: sponsorMailOutbox.id })
      .from(sponsorMailOutbox)
      .where(
        and(
          eq(sponsorMailOutbox.tenantId, tenantId),
          eq(sponsorMailOutbox.idempotencyKey, optOutConfirmationKey(entryId))
        )
      )
      .limit(1);
    if (priorConfirmation) return 'refused';
  }
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid sponsor revocation clock');
  if (input.reason === 'opted_out' && sponsorOptOutExpired(originTerm, now)) return 'refused';
  const liveTermIds = new Set(
    terms
      .filter(term => parseTimestamp(term.terminatedEffectiveAt ?? term.termEnd) > now)
      .map(term => term.id)
  );
  const ids = entries
    .filter(entry => entry.revokedAt === null && liveTermIds.has(entry.termId))
    .map(entry => entry.id);
  await applySponsorRevocation(tx, input, ids, now.toISOString());
  return ids.length;
}

async function applySponsorRevocation(
  tx: TenantTransaction,
  input: Revocation,
  ids: string[],
  at: string
): Promise<void> {
  const { tenantId, entryId } = input;
  if (input.reason === 'opted_out' && !ids.includes(entryId)) {
    await tx
      .update(sponsorRosterEntries)
      .set({ optedOutAt: at })
      .where(
        and(eq(sponsorRosterEntries.tenantId, tenantId), eq(sponsorRosterEntries.id, entryId))
      );
  }
  if (ids.length === 0 && input.reason === 'left') return;
  if (ids.length > 0) {
    await tx
      .update(sponsorRosterEntries)
      .set({
        revokedAt: at,
        revokedReason: input.reason,
        optedOutAt: sql`coalesce(${sponsorRosterEntries.optedOutAt}, ${at}::timestamptz)`,
      })
      .where(
        and(eq(sponsorRosterEntries.tenantId, tenantId), inArray(sponsorRosterEntries.id, ids))
      );
  }
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
      idempotencyKey: optOutConfirmationKey(entryId),
    })
    .onConflictDoNothing({ target: sponsorMailOutbox.idempotencyKey });
}

/** The public opt-out link. The resolver grants discovery; the locked origin grants the effect. */
export async function optOutByToken(
  token: string,
  now?: Date
): Promise<{ ok: true; revoked: number } | { ok: false }> {
  if (!token || token.length > 200) return { ok: false };
  const tokenHash = optOutTokenHash(token);
  const revoke = async (): Promise<RevocationResult> => {
    const resolved = await resolveSponsorOptOutTenant(tokenHash);
    if (!resolved) return 'refused';
    return withTenantAuthority(resolved.authority, tx =>
      revokeSponsorPerson(tx, {
        tenantId: resolved.tenantId,
        entryId: resolved.entryId,
        reason: 'opted_out',
        now,
        tokenHash,
      })
    );
  };
  let revoked = await revoke();
  // Binding is set once. A new transaction discovers it and takes the corresponding lock.
  if (revoked === 'binding_changed') revoked = await revoke();
  return typeof revoked === 'number' ? { ok: true, revoked } : { ok: false };
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
  return typeof revoked === 'number' && revoked > 0
    ? { ok: true, value: { revoked } }
    : { ok: false, error: 'not_found' };
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
        ownerAgentId: memberLeads.agentId,
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
      .leftJoin(
        memberLeads,
        and(eq(memberLeads.tenantId, sponsors.tenantId), eq(memberLeads.id, sponsors.sourceLeadId))
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
    const scope = { ownerAgentId: row.ownerAgentId, branchId: row.branchId };
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
