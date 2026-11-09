import { and, eq, isNull, sponsorHandoverCharges } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import { effectiveCoverageMembers, parseTimestamp } from '../sponsor-coverage/resolve';
import { isSponsorStaff, type SponsorActor } from './access';
import { credentialsOf } from './credential-batch';
import {
  readScheduledHandoverTasks,
  type ScheduledHandoverTask,
} from './handover-scheduled-tasks.core';
import {
  HANDOVER_ESCALATION_ATTEMPTS,
  readOpenCharges,
  readRecancellationAttempts,
  readScheduleConfirmations,
  readTaskEntries,
  readTaskIntents,
  readUnhandledPaddleRows,
} from './staff-tasks-queries';
import type { SponsorResult } from './terms';

/**
 * ACQ-3b staff-task queue. A task is derived from durable rows at read time, so it opens and
 * closes with the state it describes; only a found charge needs an explicit acknowledgement.
 */
export type SponsorStaffTask =
  | { kind: 'intent_review'; intentId: string; userId: string; since: Date }
  | { kind: 'observed_cancel'; intentId: string; userId: string; state: string; at: Date }
  /** Still retrying without a confirmed result; monitoring and the attempts are unchanged. */
  | { kind: 'retrying_cancel'; intentId: string; userId: string; attempts: number }
  /** A provider-scheduled cancel nothing wants; staff may remove it at the member's request. */
  | { kind: 'scheduled_cancel'; intentId: string; userId: string; at: Date }
  | {
      kind: 'charge';
      chargeId: string;
      intentId: string;
      userId: string;
      providerTransactionId: string;
      billingPeriodStartsAt: Date;
      foundAt: Date;
    }
  | {
      kind: 'entry_review' | 'rejected_entry';
      entryId: string;
      termId: string;
      sponsorId: string;
      userId: string | null;
      reason: string | null;
    }
  | { kind: 'checkout_race'; subscriptionId: string; userId: string }
  | { kind: 'unactivated_account'; userId: string; lastEnd: Date };

const DAY_MS = 24 * 60 * 60 * 1000;
/** An observed cancellation stays on the queue this long after it was recorded. */
export const OBSERVED_CANCEL_WINDOW_MS = 30 * DAY_MS;
/** §3.9: unactivated provisioned accounts are listed 90 days after the last entry ends. */
export const UNACTIVATED_AFTER_MS = 90 * DAY_MS;
const UNACTIVATED_LIST_LIMIT = 200;

type EntryRow = Awaited<ReturnType<typeof readTaskEntries>>[number];

const optional = (value: string | null): Date | null => (value ? parseTimestamp(value) : null);

function entryEnds(row: EntryRow): Date {
  const termEnd = optional(row.terminatedEffectiveAt) ?? parseTimestamp(row.termEnd);
  const revoked = optional(row.revokedAt);
  return revoked && revoked < termEnd ? revoked : termEnd;
}

export function entryTasks(rows: readonly EntryRow[], now: Date): SponsorStaffTask[] {
  return rows.flatMap((row): SponsorStaffTask[] => {
    if (row.revokedAt !== null || entryEnds(row) <= now) return [];
    const base = {
      entryId: row.id,
      termId: row.termId,
      sponsorId: row.sponsorId,
      userId: row.userId,
    };
    if (row.outcome === 'staff_review') {
      return [{ kind: 'entry_review', ...base, reason: row.reviewReason }];
    }
    if (row.conflictDecision === 'rejected')
      return [{ kind: 'rejected_entry', ...base, reason: null }];
    return [];
  });
}

/** People whose every bound entry ended at least 90 days ago; credentials are checked later. */
export function activationCandidates(rows: readonly EntryRow[], now: Date): Map<string, Date> {
  const lastEnd = new Map<string, Date>();
  for (const row of rows) {
    if (!row.userId) continue;
    const end = entryEnds(row);
    const known = lastEnd.get(row.userId);
    if (!known || end > known) lastEnd.set(row.userId, end);
  }
  return new Map(
    [...lastEnd].filter(([, end]) => now.getTime() - end.getTime() >= UNACTIVATED_AFTER_MS)
  );
}

type IntentRow = Awaited<ReturnType<typeof readTaskIntents>>[number];

/** Intent-derived tasks: review, a retrying cancel past the threshold, a recent cancellation. */
export function intentTasks(rows: readonly IntentRow[], now: Date): SponsorStaffTask[] {
  const out: SponsorStaffTask[] = [];
  for (const intent of rows) {
    if (intent.state === 'staff_review') {
      out.push({
        kind: 'intent_review',
        intentId: intent.id,
        userId: intent.userId,
        since: parseTimestamp(intent.updatedAt),
      });
    }
    if (intent.state === 'pending' && intent.attempts >= HANDOVER_ESCALATION_ATTEMPTS) {
      out.push({
        kind: 'retrying_cancel',
        intentId: intent.id,
        userId: intent.userId,
        attempts: intent.attempts,
      });
    }
    const canceled = optional(intent.canceledConfirmedAt);
    if (canceled && now.getTime() - canceled.getTime() < OBSERVED_CANCEL_WINDOW_MS) {
      out.push({
        kind: 'observed_cancel',
        intentId: intent.id,
        userId: intent.userId,
        state: intent.state,
        at: canceled,
      });
    }
  }
  return out;
}

/** Five latest unknown outcomes stay escalated until positive recovery evidence is recorded. */
export function recancellationTasks(
  rows: readonly Awaited<ReturnType<typeof readRecancellationAttempts>>[number][],
  confirmations: readonly Awaited<ReturnType<typeof readScheduleConfirmations>>[number][]
): SponsorStaffTask[] {
  const grouped = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) {
    const group = grouped.get(row.intentId) ?? [];
    group.push(row);
    grouped.set(row.intentId, group);
  }
  return [...grouped.values()].flatMap((group): SponsorStaffTask[] => {
    group.sort((a, b) => b.attemptNo - a.attemptNo);
    const latest = group.slice(0, HANDOVER_ESCALATION_ATTEMPTS);
    const newest = latest[0];
    if (!newest || latest.length < HANDOVER_ESCALATION_ATTEMPTS) return [];
    if (
      latest.some(attempt => attempt.outcome !== 'unknown') ||
      confirmations.some(
        row => row.intentId === newest.intentId && row.afterAttempt >= newest.attemptNo
      )
    )
      return [];
    return [
      {
        kind: 'retrying_cancel',
        intentId: newest.intentId,
        userId: newest.userId,
        attempts: newest.attempts,
      },
    ];
  });
}

/** Only before it takes effect; afterwards Paddle reports `canceled` (observed_cancel). */
export function scheduledCancelTasks(
  rows: readonly ScheduledHandoverTask[],
  now: Date
): SponsorStaffTask[] {
  return rows
    .filter(row => row.effectiveAt > now)
    .map(row => ({
      kind: 'scheduled_cancel',
      intentId: row.intentId,
      userId: row.userId,
      at: row.effectiveAt,
    }));
}

/** The open staff tasks of the tenant; staff and admins only. */
export async function listSponsorStaffTasks(
  authority: TenantAuthority,
  actor: SponsorActor,
  deps: { hasCredential: (userId: string) => Promise<boolean> },
  now: Date
): Promise<SponsorResult<SponsorStaffTask[]>> {
  if (!isSponsorStaff(actor)) return { ok: false, error: 'forbidden' };
  const { tenantId } = readTenantAuthority(authority);
  const read = await withTenantAuthority(authority, async tx => {
    const covered = (await effectiveCoverageMembers(tx, tenantId, now))
      .filter(member => member.membership.source === 'sponsor')
      .map(member => member.userId);
    return {
      intents: await readTaskIntents(tx, tenantId),
      retries: await readRecancellationAttempts(tx, tenantId),
      confirmations: await readScheduleConfirmations(tx, tenantId),
      charges: await readOpenCharges(tx, tenantId),
      entries: await readTaskEntries(tx, tenantId),
      races: await readUnhandledPaddleRows(tx, tenantId, covered),
      scheduled: await readScheduledHandoverTasks(tx, tenantId),
    };
  });
  const tasks: SponsorStaffTask[] = [];
  tasks.push(
    ...intentTasks(read.intents, now),
    ...recancellationTasks(read.retries, read.confirmations),
    ...scheduledCancelTasks(read.scheduled, now)
  );
  for (const charge of read.charges) {
    tasks.push({
      kind: 'charge',
      chargeId: charge.id,
      intentId: charge.intentId,
      userId: charge.userId,
      providerTransactionId: charge.providerTransactionId,
      billingPeriodStartsAt: parseTimestamp(charge.billingPeriodStartsAt),
      foundAt: parseTimestamp(charge.foundAt),
    });
  }
  tasks.push(...entryTasks(read.entries, now));
  for (const race of read.races) tasks.push({ kind: 'checkout_race', ...race });
  const candidates = [...activationCandidates(read.entries, now)].slice(0, UNACTIVATED_LIST_LIMIT);
  const credentialed = await credentialsOf(
    candidates.map(([userId]) => userId),
    deps.hasCredential
  );
  for (const [userId, lastEnd] of candidates) {
    if (!credentialed.has(userId)) tasks.push({ kind: 'unactivated_account', userId, lastEnd });
  }
  return { ok: true, value: tasks };
}

/** Staff acknowledge a found charge once (the refund decision stays in Paddle, §3.7 step 8). */
export async function acknowledgeHandoverCharge(
  authority: TenantAuthority,
  actor: SponsorActor,
  input: { chargeId: string; now: Date }
): Promise<SponsorResult<{ acknowledged: true }>> {
  if (!isSponsorStaff(actor)) return { ok: false, error: 'forbidden' };
  const { tenantId } = readTenantAuthority(authority);
  const updated = await withTenantAuthority(authority, tx =>
    tx
      .update(sponsorHandoverCharges)
      .set({ staffTaskId: `ack:${actor.userId}:${input.now.toISOString()}` })
      .where(
        and(
          eq(sponsorHandoverCharges.tenantId, tenantId),
          eq(sponsorHandoverCharges.id, input.chargeId),
          isNull(sponsorHandoverCharges.staffTaskId)
        )
      )
      .returning({ id: sponsorHandoverCharges.id })
  );
  return updated.length > 0
    ? { ok: true, value: { acknowledged: true } }
    : { ok: false, error: 'not_found' };
}
