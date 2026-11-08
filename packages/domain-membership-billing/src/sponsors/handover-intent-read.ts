import {
  and,
  asc,
  eq,
  isNull,
  or,
  sponsorHandoverCancelAttempts,
  sponsorHandoverIntents,
  sponsorRosterEntries,
  type TenantTransaction,
} from '@interdomestik/database';
import { lte } from 'drizzle-orm';

import type { CoverageEntry } from '../sponsor-coverage/evaluate';
import type { AttemptOutcome } from '../sponsor-coverage/handover-evidence';
import type { ReconciliationIntent } from '../sponsor-coverage/handover-reconciliation';
import { readPersonCoverage } from '../sponsor-coverage/resolve';

/** ACQ-3b §3.7 handover worker: one intent with its linked entries and attempts. */
export type IntentSnapshot = ReconciliationIntent & {
  id: string;
  userId: string;
  providerSubscriptionId: string;
  attempts: number;
  nextAttemptAt: string | null;
  paidUntilEvidence: string | null;
  canceledConfirmedAt: string | null;
  reconciliationClosedAt: string | null;
};

export type HandoverState = {
  intent: IntentSnapshot;
  /** Every entry linked to the intent, with its coverage facts. */
  linked: CoverageEntry[];
  attempts: { id: string; attemptNo: number; outcome: AttemptOutcome }[];
};

/** Reads the intent (taking it `FOR UPDATE` when `lock`), its linked entries and attempts. */
export async function readHandoverState(
  tx: TenantTransaction,
  tenantId: string,
  intentId: string,
  options: { lock: boolean }
): Promise<HandoverState | null> {
  const query = tx
    .select({
      id: sponsorHandoverIntents.id,
      userId: sponsorHandoverIntents.userId,
      providerSubscriptionId: sponsorHandoverIntents.providerSubscriptionId,
      state: sponsorHandoverIntents.state,
      staffDisposition: sponsorHandoverIntents.staffDisposition,
      cancelDispatchedAt: sponsorHandoverIntents.cancelDispatchedAt,
      dispatchPeriodEndsAt: sponsorHandoverIntents.dispatchPeriodEndsAt,
      restorationCutoff: sponsorHandoverIntents.restorationCutoff,
      attempts: sponsorHandoverIntents.attempts,
      nextAttemptAt: sponsorHandoverIntents.nextAttemptAt,
      paidUntil: sponsorHandoverIntents.paidUntil,
      paidUntilEvidence: sponsorHandoverIntents.paidUntilEvidence,
      canceledConfirmedAt: sponsorHandoverIntents.canceledConfirmedAt,
      reconciliationClosedAt: sponsorHandoverIntents.reconciliationClosedAt,
    })
    .from(sponsorHandoverIntents)
    .where(
      and(eq(sponsorHandoverIntents.tenantId, tenantId), eq(sponsorHandoverIntents.id, intentId))
    );
  const [intent] = options.lock ? await query.for('update') : await query;
  if (!intent) return null;

  const linkedIds = await tx
    .select({ id: sponsorRosterEntries.id })
    .from(sponsorRosterEntries)
    .where(
      and(
        eq(sponsorRosterEntries.tenantId, tenantId),
        eq(sponsorRosterEntries.handoverIntentId, intentId)
      )
    );
  const ids = new Set(linkedIds.map(row => row.id));
  const person = ids.size > 0 ? await readPersonCoverage(tx, tenantId, intent.userId) : null;
  const linked = (person?.entries ?? []).filter(entry => ids.has(entry.id));

  const attempts = await tx
    .select({
      id: sponsorHandoverCancelAttempts.id,
      attemptNo: sponsorHandoverCancelAttempts.attemptNo,
      outcome: sponsorHandoverCancelAttempts.outcome,
    })
    .from(sponsorHandoverCancelAttempts)
    .where(
      and(
        eq(sponsorHandoverCancelAttempts.tenantId, tenantId),
        eq(sponsorHandoverCancelAttempts.intentId, intentId)
      )
    )
    .orderBy(asc(sponsorHandoverCancelAttempts.attemptNo));
  return { intent, linked, attempts };
}

/** Intents whose watch or reconciliation is still open and whose next run is due. */
export async function listDueIntents(
  tx: TenantTransaction,
  tenantId: string,
  now: Date,
  limit: number
): Promise<string[]> {
  const rows = await tx
    .select({ id: sponsorHandoverIntents.id })
    .from(sponsorHandoverIntents)
    .where(
      and(
        eq(sponsorHandoverIntents.tenantId, tenantId),
        isNull(sponsorHandoverIntents.reconciliationClosedAt),
        or(
          isNull(sponsorHandoverIntents.nextAttemptAt),
          lte(sponsorHandoverIntents.nextAttemptAt, now.toISOString())
        )
      )
    )
    .orderBy(asc(sponsorHandoverIntents.nextAttemptAt), asc(sponsorHandoverIntents.id))
    .limit(limit);
  return rows.map(row => row.id);
}
