import {
  and,
  eq,
  sponsorHandoverIntents,
  sponsorRosterEntries,
  type TenantTransaction,
} from '@interdomestik/database';
import { nanoid } from 'nanoid';

import { parseTimestamp } from '../sponsor-coverage/resolve';

/**
 * ACQ-3b §3.7 linking an entry to the person's handover intent (lock 7). One intent exists per
 * Paddle subscription. Only a `pending` or `cancel_scheduled` intent takes another entry; any
 * other state fails closed to staff review, or to the immediate path once the subscription can no
 * longer collect payment. Historical `paid_until` never starts a new entry.
 */
export type PaddleRow = {
  id: string;
  providerSubscriptionId: string | null;
  status: string | null;
};

export type IntentLink =
  | { kind: 'linked'; intentId: string; paidUntil: Date | null }
  | { kind: 'review' }
  | { kind: 'immediate' };

const REUSABLE: ReadonlySet<string> = new Set(['pending', 'cancel_scheduled']);
const CANNOT_COLLECT: ReadonlySet<string> = new Set(['canceled', 'expired']);

export async function linkHandoverIntent(
  tx: TenantTransaction,
  params: {
    tenantId: string;
    entryId: string;
    userId: string;
    subscription: PaddleRow;
    /** `handover` creates a `pending` intent; `paddle_review` creates one in `staff_review`. */
    mode: 'handover' | 'paddle_review';
  }
): Promise<IntentLink> {
  const { tenantId, subscription } = params;
  const providerSubscriptionId = subscription.providerSubscriptionId;
  if (!providerSubscriptionId) return { kind: 'review' };

  let intent = await lockIntent(tx, tenantId, providerSubscriptionId);
  if (!intent) {
    await tx
      .insert(sponsorHandoverIntents)
      .values({
        id: `sph_${nanoid()}`,
        tenantId,
        userId: params.userId,
        subscriptionId: subscription.id,
        providerSubscriptionId,
        state: params.mode === 'handover' ? 'pending' : 'staff_review',
      })
      .onConflictDoNothing();
    intent = await lockIntent(tx, tenantId, providerSubscriptionId);
    if (!intent) return { kind: 'review' };
    return attach(tx, tenantId, params.entryId, intent);
  }
  if (intent.userId !== params.userId) return { kind: 'review' };
  if (REUSABLE.has(intent.state)) return attach(tx, tenantId, params.entryId, intent);
  return subscription.status && CANNOT_COLLECT.has(subscription.status)
    ? { kind: 'immediate' }
    : { kind: 'review' };
}

type LockedIntent = { id: string; userId: string; state: string; paidUntil: string | null };

async function lockIntent(
  tx: TenantTransaction,
  tenantId: string,
  providerSubscriptionId: string
): Promise<LockedIntent | null> {
  const [row] = await tx
    .select({
      id: sponsorHandoverIntents.id,
      userId: sponsorHandoverIntents.userId,
      state: sponsorHandoverIntents.state,
      paidUntil: sponsorHandoverIntents.paidUntil,
    })
    .from(sponsorHandoverIntents)
    .where(
      and(
        eq(sponsorHandoverIntents.tenantId, tenantId),
        eq(sponsorHandoverIntents.providerSubscriptionId, providerSubscriptionId)
      )
    )
    .for('update');
  return row ?? null;
}

async function attach(
  tx: TenantTransaction,
  tenantId: string,
  entryId: string,
  intent: LockedIntent
): Promise<IntentLink> {
  await tx
    .update(sponsorRosterEntries)
    .set({ handoverIntentId: intent.id })
    .where(and(eq(sponsorRosterEntries.tenantId, tenantId), eq(sponsorRosterEntries.id, entryId)));
  return {
    kind: 'linked',
    intentId: intent.id,
    paidUntil:
      intent.state === 'cancel_scheduled' && intent.paidUntil
        ? parseTimestamp(intent.paidUntil)
        : null,
  };
}
