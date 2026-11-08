import {
  and,
  asc,
  eq,
  inArray,
  sponsorRosterEntries,
  sponsorTerms,
  type TenantTransaction,
} from '@interdomestik/database';
import { lockSponsorPerson } from '@interdomestik/database/sponsor-locks';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import { attemptOutcomeFromResponse } from '../sponsor-coverage/handover-evidence';
import { applyHandoverPlan, resolveAttempt } from './handover-apply';
import { listDueIntents, readHandoverState } from './handover-intent-read';
import { planHandoverStep } from './handover-plan';
import type { HandoverPaddleClient } from './paddle-handover-client';

export const HANDOVER_BATCH_LIMIT = 50;

export type HandoverDeps = {
  client: HandoverPaddleClient;
  hasCredential: (userId: string) => Promise<boolean>;
};

export type HandoverRunOutcome = 'skipped' | 'observed' | 'dispatched';

/**
 * §3.5 person locks for the worker's write transaction: lock 2, the person's terms `FOR SHARE`,
 * the person's entries `FOR UPDATE` in id order; the caller then takes the intent (lock 7). A
 * revocation, termination or provisioning step committed meanwhile is therefore seen, never raced.
 */
export async function lockPerson(
  tx: TenantTransaction,
  tenantId: string,
  userId: string
): Promise<void> {
  await lockSponsorPerson(tx, userId);
  const personEntries = and(
    eq(sponsorRosterEntries.tenantId, tenantId),
    eq(sponsorRosterEntries.userId, userId)
  );
  const termIds = tx
    .select({ termId: sponsorRosterEntries.termId })
    .from(sponsorRosterEntries)
    .where(personEntries);
  await tx
    .select({ id: sponsorTerms.id })
    .from(sponsorTerms)
    .where(and(eq(sponsorTerms.tenantId, tenantId), inArray(sponsorTerms.id, termIds)))
    .orderBy(asc(sponsorTerms.id))
    .for('share');
  await tx
    .select({ id: sponsorRosterEntries.id })
    .from(sponsorRosterEntries)
    .where(personEntries)
    .orderBy(asc(sponsorRosterEntries.id))
    .for('update');
}

/**
 * ACQ-3b §3.7 one intent: read Paddle outside any transaction, decide and write under the person
 * locks, then, only after the attempt row has committed, send the cancel and resolve that attempt
 * from its own response. The only Paddle write is the cancel.
 */
export async function runHandoverIntent(
  authority: TenantAuthority,
  deps: HandoverDeps,
  input: { intentId: string; now: Date }
): Promise<HandoverRunOutcome> {
  const { tenantId } = readTenantAuthority(authority);
  const { intentId, now } = input;
  const snapshot = await withTenantAuthority(authority, tx =>
    readHandoverState(tx, tenantId, intentId, { lock: false })
  );
  if (!snapshot || snapshot.intent.reconciliationClosedAt) return 'skipped';
  const providerSubscriptionId = snapshot.intent.providerSubscriptionId;
  const readBack = await deps.client.getSubscription(providerSubscriptionId);
  const transactions = await deps.client.listTransactions(providerSubscriptionId);

  const ticket = await withTenantAuthority(authority, async tx => {
    await lockPerson(tx, tenantId, snapshot.intent.userId);
    const state = await readHandoverState(tx, tenantId, intentId, { lock: true });
    if (!state || state.intent.reconciliationClosedAt) return null;
    const plan = planHandoverStep(state, readBack, transactions, now);
    return applyHandoverPlan(tx, {
      tenantId,
      state,
      plan,
      now,
      hasCredential: deps.hasCredential,
    });
  });
  if (!ticket) return 'observed';

  const response = await deps.client.cancelAtNextPeriod(ticket.providerSubscriptionId);
  await withTenantAuthority(authority, tx =>
    resolveAttempt(tx, {
      tenantId,
      intentId,
      attemptId: ticket.attemptId,
      outcome: attemptOutcomeFromResponse(response),
      evidenceRef: response.kind === 'definite_error' ? response.code : null,
      now: new Date(),
    })
  );
  return 'dispatched';
}

export type HandoverRunSummary = {
  processed: number;
  failed: number;
  outcomes: Partial<Record<HandoverRunOutcome, number>>;
};

/** Cron pass for one tenant; a failure is counted and retried by a later pass. */
export async function runSponsorHandovers(
  authority: TenantAuthority,
  deps: HandoverDeps,
  options: { now: Date; limit?: number }
): Promise<HandoverRunSummary> {
  const { tenantId } = readTenantAuthority(authority);
  const ids = await withTenantAuthority(authority, tx =>
    listDueIntents(tx, tenantId, options.now, options.limit ?? HANDOVER_BATCH_LIMIT)
  );
  const summary: HandoverRunSummary = { processed: 0, failed: 0, outcomes: {} };
  await ids.reduce<Promise<void>>(
    (previous, intentId) =>
      previous.then(async () => {
        try {
          const outcome = await runHandoverIntent(authority, deps, {
            intentId,
            now: options.now,
          });
          summary.processed += 1;
          summary.outcomes[outcome] = (summary.outcomes[outcome] ?? 0) + 1;
        } catch {
          summary.failed += 1;
        }
      }),
    Promise.resolve()
  );
  return summary;
}
