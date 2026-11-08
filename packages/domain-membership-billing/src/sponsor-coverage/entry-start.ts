import {
  and,
  eq,
  inArray,
  sponsorMailOutbox,
  sponsorRosterEntries,
  type TenantTransaction,
} from '@interdomestik/database';
import { nanoid } from 'nanoid';

import type { EntryInterval } from './evaluate';

/**
 * ACQ-3b §3.7 entry-start producer: one function for every transaction that gives an entry a
 * derived start (immediate path, continuing entry, evidence publication, linking to an intent
 * that already has `paid_until`, staff evidence). The idempotency key is entry + kind, so a
 * second run queues nothing.
 */
export type EntryStartMail = {
  kind: 'handover_confirmed' | 'sponsor_notice' | 'activation';
  notBefore: Date | null;
};

export type EntryStartPlan =
  | { outcome: 'staff_review'; reviewReason: 'empty_interval'; mails: [] }
  | { outcome: 'seated'; reviewReason: null; mails: EntryStartMail[] };

export function planEntryStart(
  interval: EntryInterval,
  options: { handover: boolean; hasCredential: boolean }
): EntryStartPlan {
  if (interval.start.getTime() >= interval.end.getTime()) {
    return { outcome: 'staff_review', reviewReason: 'empty_interval', mails: [] };
  }
  const mails: EntryStartMail[] = [];
  if (options.handover) mails.push({ kind: 'handover_confirmed', notBefore: null });
  mails.push({ kind: 'sponsor_notice', notBefore: interval.start });
  if (!options.hasCredential) mails.push({ kind: 'activation', notBefore: interval.start });
  return { outcome: 'seated', reviewReason: null, mails };
}

export const entryStartIdempotencyKey = (entryId: string, kind: EntryStartMail['kind']): string =>
  `sponsor-entry:${entryId}:${kind}`;

/** Applies the plan inside the caller's person transaction (§3.5 locks already held). */
export async function produceEntryStart(
  tx: TenantTransaction,
  params: {
    tenantId: string;
    entryId: string;
    interval: EntryInterval;
    handover: boolean;
    hasCredential: boolean;
  }
): Promise<EntryStartPlan> {
  const plan = planEntryStart(params.interval, params);
  await tx
    .update(sponsorRosterEntries)
    .set({ outcome: plan.outcome, reviewReason: plan.reviewReason })
    .where(
      and(
        eq(sponsorRosterEntries.tenantId, params.tenantId),
        eq(sponsorRosterEntries.id, params.entryId)
      )
    );
  if (plan.mails.length === 0) return plan;
  await tx
    .insert(sponsorMailOutbox)
    .values(
      plan.mails.map(mail => ({
        id: nanoid(),
        tenantId: params.tenantId,
        rosterEntryId: params.entryId,
        kind: mail.kind,
        idempotencyKey: entryStartIdempotencyKey(params.entryId, mail.kind),
        ...(mail.notBefore ? { nextAttemptAt: mail.notBefore.toISOString() } : {}),
      }))
    )
    .onConflictDoNothing({ target: sponsorMailOutbox.idempotencyKey });
  return plan;
}

/**
 * The producer for several entries of one person in one transaction (evidence publication, §3.7
 * step 2): the same plan per entry, written as one update per outcome and one outbox insert.
 */
export async function produceEntryStarts(
  tx: TenantTransaction,
  params: {
    tenantId: string;
    starts: readonly { entryId: string; interval: EntryInterval }[];
    handover: boolean;
    hasCredential: boolean;
  }
): Promise<EntryStartPlan[]> {
  const planned = params.starts.map(start => ({
    entryId: start.entryId,
    plan: planEntryStart(start.interval, params),
  }));
  const idsWith = (outcome: EntryStartPlan['outcome']) =>
    planned.filter(item => item.plan.outcome === outcome).map(item => item.entryId);
  const seated = idsWith('seated');
  const review = idsWith('staff_review');
  const where = (ids: string[]) =>
    and(eq(sponsorRosterEntries.tenantId, params.tenantId), inArray(sponsorRosterEntries.id, ids));
  if (seated.length > 0) {
    await tx
      .update(sponsorRosterEntries)
      .set({ outcome: 'seated', reviewReason: null })
      .where(where(seated));
  }
  if (review.length > 0) {
    await tx
      .update(sponsorRosterEntries)
      .set({ outcome: 'staff_review', reviewReason: 'empty_interval' })
      .where(where(review));
  }
  const mails = planned.flatMap(item =>
    item.plan.mails.map(mail => ({
      id: nanoid(),
      tenantId: params.tenantId,
      rosterEntryId: item.entryId,
      kind: mail.kind,
      idempotencyKey: entryStartIdempotencyKey(item.entryId, mail.kind),
      ...(mail.notBefore ? { nextAttemptAt: mail.notBefore.toISOString() } : {}),
    }))
  );
  if (mails.length > 0) {
    await tx
      .insert(sponsorMailOutbox)
      .values(mails)
      .onConflictDoNothing({ target: sponsorMailOutbox.idempotencyKey });
  }
  return planned.map(item => item.plan);
}
