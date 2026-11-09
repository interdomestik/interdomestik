import { and, eq, sponsorHandoverIntents, type TenantTransaction } from '@interdomestik/database';
import type { HandoverState } from './handover-intent-read';
import type { HandoverPlan } from './handover-plan';
import type { DispatchTicket } from './handover-apply';

export async function persistHandoverIntent(
  tx: TenantTransaction,
  tenantId: string,
  state: HandoverState,
  plan: HandoverPlan,
  now: Date,
  ticket: DispatchTicket | null
): Promise<void> {
  const { intent } = state;
  const iso = (value: Date): string => value.toISOString();
  await tx
    .update(sponsorHandoverIntents)
    .set({
      ...(plan.nextState ? { state: plan.nextState } : {}),
      ...(plan.evidence
        ? { paidUntil: plan.evidence.paidUntil, paidUntilEvidence: plan.evidence.transactionId }
        : {}),
      ...(plan.observedCancel ? { canceledConfirmedAt: iso(now) } : {}),
      ...(intent.paidUntil || intent.dispatchPeriodEndsAt || ticket
        ? { reconciledThrough: iso(now) }
        : {}),
      ...(plan.closeReconciliation ? { reconciliationClosedAt: iso(now) } : {}),
      nextAttemptAt: iso(plan.nextRunAt),
      updatedAt: iso(now),
    })
    .where(
      and(eq(sponsorHandoverIntents.tenantId, tenantId), eq(sponsorHandoverIntents.id, intent.id))
    );
}
