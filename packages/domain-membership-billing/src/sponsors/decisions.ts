import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  sponsorMailOutbox,
  sponsorRevisionDecisions,
  sponsorRosterEntries,
  sponsors,
  sponsorTermRevisions,
  sponsorTerms,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { nanoid } from 'nanoid';

import { parseTimestamp } from '../sponsor-coverage/resolve';
import { canDecideRevision, type SponsorActor } from './access';
import type { SponsorResult } from './terms';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Staff approve or reject a term's highest revision once (§3.3); the decider is never the
 * revision's creator. Serialized under `sponsors FOR UPDATE` → `sponsor_terms FOR UPDATE`.
 */
export async function decideRevision(
  authority: TenantAuthority,
  actor: SponsorActor,
  input: { revisionId: string; decision: 'approved' | 'rejected'; invoiceReference: string | null }
): Promise<SponsorResult<{ decisionId: string }>> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    const [target] = await tx
      .select({
        termId: sponsorTermRevisions.termId,
        revision: sponsorTermRevisions.revision,
        createdBy: sponsorTermRevisions.createdBy,
        sponsorId: sponsorTerms.sponsorId,
      })
      .from(sponsorTermRevisions)
      .innerJoin(
        sponsorTerms,
        and(
          eq(sponsorTerms.tenantId, sponsorTermRevisions.tenantId),
          eq(sponsorTerms.id, sponsorTermRevisions.termId)
        )
      )
      .where(
        and(
          eq(sponsorTermRevisions.tenantId, tenantId),
          eq(sponsorTermRevisions.id, input.revisionId)
        )
      );
    if (!target) return { ok: false, error: 'not_found' };
    if (!canDecideRevision(actor, target.createdBy)) return { ok: false, error: 'forbidden' };
    await tx
      .select({ id: sponsors.id })
      .from(sponsors)
      .where(and(eq(sponsors.tenantId, tenantId), eq(sponsors.id, target.sponsorId)))
      .for('update');
    await tx
      .select({ id: sponsorTerms.id })
      .from(sponsorTerms)
      .where(and(eq(sponsorTerms.tenantId, tenantId), eq(sponsorTerms.id, target.termId)))
      .for('update');
    const [highest] = await tx
      .select({ revision: sponsorTermRevisions.revision })
      .from(sponsorTermRevisions)
      .where(
        and(
          eq(sponsorTermRevisions.tenantId, tenantId),
          eq(sponsorTermRevisions.termId, target.termId)
        )
      )
      .orderBy(desc(sponsorTermRevisions.revision))
      .limit(1);
    if (highest?.revision !== target.revision) return { ok: false, error: 'conflict' };
    const decisionId = `spd_${nanoid()}`;
    const inserted = await tx
      .insert(sponsorRevisionDecisions)
      .values({
        id: decisionId,
        tenantId,
        revisionId: input.revisionId,
        decision: input.decision,
        decidedBy: actor.userId,
        invoiceReference: input.invoiceReference,
      })
      .onConflictDoNothing()
      .returning({ id: sponsorRevisionDecisions.id });
    return inserted.length > 0
      ? { ok: true, value: { decisionId } }
      : { ok: false, error: 'conflict' };
  });
}

/** §3.6.2 single-phase termination; the effective instant is always at least 24 h ahead. */
export function isValidTermination(params: {
  now: Date;
  effectiveAt: Date;
  termStart: Date;
  termEnd: Date;
  hasContiguousApprovedSuccessor: boolean;
}): boolean {
  const { now, effectiveAt, termStart, termEnd } = params;
  return (
    !params.hasContiguousApprovedSuccessor &&
    effectiveAt.getTime() >= now.getTime() + DAY_MS &&
    effectiveAt >= termStart &&
    effectiveAt <= termEnd
  );
}

export async function terminateTerm(
  authority: TenantAuthority,
  actor: SponsorActor,
  input: { termId: string; effectiveAt: Date; now: Date }
): Promise<SponsorResult<{ noticesQueued: number }>> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    const [term] = await tx
      .select({ sponsorId: sponsorTerms.sponsorId, createdBy: sponsorTerms.createdBy })
      .from(sponsorTerms)
      .where(and(eq(sponsorTerms.tenantId, tenantId), eq(sponsorTerms.id, input.termId)));
    if (!term) return { ok: false, error: 'not_found' };
    if (!canDecideRevision(actor, term.createdBy)) return { ok: false, error: 'forbidden' };
    await tx
      .select({ id: sponsors.id })
      .from(sponsors)
      .where(and(eq(sponsors.tenantId, tenantId), eq(sponsors.id, term.sponsorId)))
      .for('update');
    const lockedTerms = await tx
      .select({
        id: sponsorTerms.id,
        termStart: sponsorTerms.termStart,
        termEnd: sponsorTerms.termEnd,
        terminatedEffectiveAt: sponsorTerms.terminatedEffectiveAt,
      })
      .from(sponsorTerms)
      .where(and(eq(sponsorTerms.tenantId, tenantId), eq(sponsorTerms.sponsorId, term.sponsorId)))
      .orderBy(sponsorTerms.id)
      .for('update');
    const approved = await tx
      .selectDistinct({ termId: sponsorTermRevisions.termId })
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
          inArray(
            sponsorTermRevisions.termId,
            lockedTerms.map(row => row.id)
          )
        )
      );
    const approvedTerms = new Set(approved.map(row => row.termId));
    const sponsorTermRows = lockedTerms.map(row => ({
      ...row,
      approved: approvedTerms.has(row.id),
    }));
    const self = sponsorTermRows.find(row => row.id === input.termId);
    if (!self || self.terminatedEffectiveAt !== null) return { ok: false, error: 'conflict' };
    const end = parseTimestamp(self.termEnd);
    const hasContiguousApprovedSuccessor = sponsorTermRows.some(row => {
      if (row.id === self.id || !row.approved) return false;
      const start = parseTimestamp(row.termStart);
      const successorEnd = parseTimestamp(row.terminatedEffectiveAt ?? row.termEnd);
      return start.getTime() === end.getTime() && successorEnd > start;
    });
    const valid = isValidTermination({
      now: input.now,
      effectiveAt: input.effectiveAt,
      termStart: parseTimestamp(self.termStart),
      termEnd: end,
      hasContiguousApprovedSuccessor,
    });
    if (!valid) return { ok: false, error: 'invalid' };
    await tx
      .update(sponsorTerms)
      .set({
        terminatedEffectiveAt: input.effectiveAt.toISOString(),
        terminatedBy: actor.userId,
        terminatedAt: input.now.toISOString(),
      })
      .where(and(eq(sponsorTerms.tenantId, tenantId), eq(sponsorTerms.id, input.termId)));
    const entries = await tx
      .select({ id: sponsorRosterEntries.id })
      .from(sponsorRosterEntries)
      .where(
        and(
          eq(sponsorRosterEntries.tenantId, tenantId),
          eq(sponsorRosterEntries.termId, input.termId),
          isNull(sponsorRosterEntries.revokedAt)
        )
      );
    if (entries.length > 0) {
      await tx
        .insert(sponsorMailOutbox)
        .values(
          entries.map(entry => ({
            id: nanoid(),
            tenantId,
            rosterEntryId: entry.id,
            kind: 'renewal_notice' as const,
            idempotencyKey: `sponsor-entry:${entry.id}:renewal_notice:termination`,
          }))
        )
        .onConflictDoNothing({ target: sponsorMailOutbox.idempotencyKey });
    }
    return { ok: true, value: { noticesQueued: entries.length } };
  });
}
