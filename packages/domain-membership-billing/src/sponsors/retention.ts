import {
  and,
  eq,
  inArray,
  sponsorHandoverCancelAttempts as attempts,
  sponsorHandoverCharges as charges,
  sponsorHandoverIntents as intents,
  sponsorMailOutbox as mail,
  sponsorRevisionDecisions as decisions,
  sponsorRosterEntries as entries,
  sponsors,
  sponsorTermRevisions as revisions,
  sponsorTerms as terms,
} from '@interdomestik/database';
import { lockSponsorPerson } from '@interdomestik/database/sponsor-locks';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { lte } from 'drizzle-orm';

import {
  canPurgeHandover,
  outboxRetentionCutoff,
  planOutboxDeletion,
  planRetention,
  type RetentionSummary,
} from './retention-plan';

export type { RetentionSummary } from './retention-plan';

/** §3.9: each term is atomic; a failure rolls it back and is surfaced for the next cron retry. */
export async function runSponsorRetention(
  authority: TenantAuthority,
  { now }: { now: Date }
): Promise<RetentionSummary> {
  const { tenantId } = readTenantAuthority(authority);
  const cutoff = outboxRetentionCutoff(now).toISOString();
  const summary: RetentionSummary = {
    processedTerms: 0,
    purgedTerms: 0,
    invalidatedTokens: 0,
    erasedAddresses: 0,
    erasedHmacs: 0,
    skippedOutbox: 0,
    deletedOutbox: 0,
    purgedIntents: 0,
  };
  const work = await withTenantAuthority(authority, async tx => {
    const terminal = await tx
      .select()
      .from(mail)
      .where(and(eq(mail.tenantId, tenantId), lte(mail.terminalAt, cutoff)));
    const ids = planOutboxDeletion(terminal, now);
    const deleted =
      ids.length === 0
        ? []
        : await tx
            .delete(mail)
            .where(
              and(
                eq(mail.tenantId, tenantId),
                inArray(mail.id, ids),
                inArray(mail.state, ['sent', 'skipped', 'failed']),
                lte(mail.terminalAt, cutoff)
              )
            )
            .returning({ id: mail.id });
    const targets = await tx
      .select({ id: terms.id, sponsorId: terms.sponsorId })
      .from(terms)
      .where(eq(terms.tenantId, tenantId))
      .orderBy(terms.id);
    return { targets, deleted: deleted.length };
  });
  summary.deletedOutbox = work.deleted;
  await work.targets.reduce<Promise<void>>(
    (previous, target) =>
      previous.then(async () => {
        const counts = await retainTerm(authority, target, now);
        for (const key of Object.keys(counts) as (keyof RetentionSummary)[]) {
          summary[key] += counts[key] ?? 0;
        }
      }),
    Promise.resolve()
  );
  const handovers = await withTenantAuthority(authority, tx =>
    tx
      .select({ id: intents.id, userId: intents.userId })
      .from(intents)
      .where(eq(intents.tenantId, tenantId))
      .orderBy(intents.id)
  );
  await handovers.reduce<Promise<void>>(
    (previous, intent) =>
      previous.then(async () => {
        summary.purgedIntents += await purgeHandover(authority, intent);
      }),
    Promise.resolve()
  );
  return summary;
}

async function retainTerm(
  authority: TenantAuthority,
  target: { id: string; sponsorId: string },
  now: Date
): Promise<Partial<RetentionSummary>> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    // Serialize the sponsor's last-end decision with term creation/upload/approval.
    await tx
      .select({ id: sponsors.id })
      .from(sponsors)
      .where(and(eq(sponsors.tenantId, tenantId), eq(sponsors.id, target.sponsorId)))
      .for('update');
    const [term] = await tx
      .select()
      .from(terms)
      .where(and(eq(terms.tenantId, tenantId), eq(terms.id, target.id)))
      .for('update');
    if (!term) return {};
    const sponsorTerms = await tx
      .select()
      .from(terms)
      .where(and(eq(terms.tenantId, tenantId), eq(terms.sponsorId, term.sponsorId)));
    const entryWhere = and(eq(entries.tenantId, tenantId), eq(entries.termId, term.id));
    const roster = await tx
      .select()
      .from(entries)
      .where(entryWhere)
      .orderBy(entries.id)
      .for('update');
    const entryIds = roster.map(row => row.id);
    const outbox =
      entryIds.length === 0
        ? []
        : await tx
            .select()
            .from(mail)
            .where(and(eq(mail.tenantId, tenantId), inArray(mail.rosterEntryId, entryIds)))
            .orderBy(mail.id)
            .for('update');
    const plan = planRetention({ term, sponsorTerms, entries: roster, outbox }, now);
    if (plan.skipOutboxIds.length > 0) {
      await tx
        .update(mail)
        .set({ state: 'skipped', terminalAt: now.toISOString() })
        .where(
          and(
            eq(mail.tenantId, tenantId),
            inArray(mail.id, plan.skipOutboxIds),
            inArray(mail.state, ['queued', 'claimed'])
          )
        );
    }
    if (plan.invalidateTokenIds.length > 0) {
      await tx
        .update(entries)
        .set({ optoutTokenHash: null })
        .where(and(entryWhere, inArray(entries.id, plan.invalidateTokenIds)));
    }
    if (plan.eraseAddressIds.length > 0) {
      await tx
        .update(entries)
        .set({ firstName: null, lastName: null, emailNormalized: null })
        .where(and(entryWhere, inArray(entries.id, plan.eraseAddressIds)));
    }
    if (plan.eraseHmacIds.length > 0) {
      await tx
        .update(entries)
        .set({ emailHmac: null })
        .where(and(entryWhere, inArray(entries.id, plan.eraseHmacIds)));
    }
    if (plan.purgeTerm) {
      const revisionIds = tx
        .select({ id: revisions.id })
        .from(revisions)
        .where(and(eq(revisions.tenantId, tenantId), eq(revisions.termId, term.id)));
      await tx
        .delete(decisions)
        .where(and(eq(decisions.tenantId, tenantId), inArray(decisions.revisionId, revisionIds)));
      await tx
        .delete(revisions)
        .where(and(eq(revisions.tenantId, tenantId), eq(revisions.termId, term.id)));
      // The FK points FROM entries TO intents. Attempt snapshots have no entry/term FK.
      await tx.delete(entries).where(entryWhere);
      await tx.delete(terms).where(and(eq(terms.tenantId, tenantId), eq(terms.id, term.id)));
    }
    return {
      processedTerms: 1,
      purgedTerms: Number(plan.purgeTerm),
      skippedOutbox: plan.skipOutboxIds.length,
      invalidatedTokens: plan.invalidateTokenIds.length,
      erasedAddresses: plan.eraseAddressIds.length,
      erasedHmacs: plan.eraseHmacIds.length,
    };
  });
}

async function purgeHandover(
  authority: TenantAuthority,
  target: { id: string; userId: string }
): Promise<number> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    await lockSponsorPerson(tx, target.userId);
    const [intent] = await tx
      .select()
      .from(intents)
      .where(and(eq(intents.tenantId, tenantId), eq(intents.id, target.id)))
      .for('update');
    if (!intent) return 0;
    const linked = await tx
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.tenantId, tenantId), eq(entries.handoverIntentId, intent.id)))
      .limit(1);
    const outbox = await tx
      .select({ id: mail.id })
      .from(mail)
      .where(and(eq(mail.tenantId, tenantId), eq(mail.handoverIntentId, intent.id)))
      .limit(1);
    const evidence = await tx
      .select({ outcome: attempts.outcome })
      .from(attempts)
      .where(and(eq(attempts.tenantId, tenantId), eq(attempts.intentId, intent.id)));
    if (
      !canPurgeHandover({
        linkedEntries: linked.length,
        intentOutboxRows: outbox.length,
        reconciliationClosedAt: intent.reconciliationClosedAt,
        attempts: evidence,
      })
    )
      return 0;
    await tx
      .delete(attempts)
      .where(and(eq(attempts.tenantId, tenantId), eq(attempts.intentId, intent.id)));
    await tx
      .delete(charges)
      .where(and(eq(charges.tenantId, tenantId), eq(charges.intentId, intent.id)));
    await tx.delete(intents).where(and(eq(intents.tenantId, tenantId), eq(intents.id, intent.id)));
    return 1;
  });
}
