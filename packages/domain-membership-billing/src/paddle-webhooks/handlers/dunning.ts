import { and, eq, subscriptions, withTenantContext } from '@interdomestik/database';
import { resolveCanonicalMembershipPlanState } from '../../annual-membership';

import { RetryablePaddleWebhookError } from '../errors';
import type { PaddleWebhookAuditDeps, PaddleWebhookDeps, PastDueEmailDeps } from '../types';
import {
  findExistingPastDueSubscriptionForUser,
  resolvePastDueContext,
  type ExistingSubscriptionRecord,
  type PastDueUserRecord,
} from './dunning-context';
import {
  DUNNING_GRACE_PERIOD_DAYS,
  buildPastDueState,
  parsePastDueSubscription,
  type PastDueValues,
  type SubscriptionEventData,
} from './dunning-state';
import { handleOrderedPastDue } from './dunning-ordered-handler';
import { resolveSubscriptionEventOrder } from './subscription-event-order';

const redactEmail = (email?: string | null) => {
  if (!email) return 'unknown';
  const [local, domain] = email.split('@');
  if (!domain) return 'unknown';
  const maskedLocal = local.length <= 2 ? `${local[0] ?? ''}*` : `${local[0]}***${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
};

export async function handleSubscriptionPastDue(
  params: {
    data: unknown;
    tenantId?: string | null;
    processingScopeKey?: string;
    providerEventId?: string;
    providerEventOccurredAt?: string | null;
  },
  deps: Pick<PaddleWebhookDeps, 'sendPaymentFailedEmail'> &
    PaddleWebhookAuditDeps &
    PastDueEmailDeps = {}
) {
  const sub = parsePastDueSubscription(params.data);
  if (!sub) {
    return;
  }
  // Entity-scoped past_due is ordered like other lifecycle events; the legacy
  // unscoped route keeps its existing behavior.
  const order = resolveSubscriptionEventOrder({
    processingScopeKey: params.processingScopeKey,
    providerEventId: params.providerEventId,
    providerEventOccurredAt: params.providerEventOccurredAt,
    providerSubscriptionId: sub.id,
  });

  const context = await resolvePastDueContext(sub, {
    requireExactProviderRow: Boolean(order),
    tenantId: params.tenantId,
  });
  if (!context) {
    return;
  }

  const priceId = sub.items?.[0]?.price?.id || sub.items?.[0]?.priceId || 'unknown';
  const canonicalPlanState = await resolveCanonicalMembershipPlanState({
    tenantId: context.userRecord.tenantId,
    planId: priceId,
  });
  const now = new Date();
  const buildState = (existingSub: ExistingSubscriptionRecord) =>
    buildPastDueState({
      sub,
      userId: context.userRecord.id,
      userRecord: context.userRecord,
      existingSub,
      now,
      planState: canonicalPlanState,
    });

  let pastDueState: ReturnType<typeof buildPastDueState>;
  if (order && context.existingSub) {
    await handleOrderedPastDue({
      order,
      providerSubscriptionId: sub.id,
      subscriptionId: context.existingSub.id,
      tenantId: context.userRecord.tenantId,
      user: context.userRecord,
      planName: sub.items?.[0]?.price?.description || 'Membership',
      buildState,
      deps,
    });
    return;
  } else if (order) {
    throw new RetryablePaddleWebhookError(
      `Entity past_due for ${sub.id} requires an existing provider subscription row`
    );
  } else {
    pastDueState = buildState(context.existingSub);
    await persistPastDueSubscription({
      subscriptionId: sub.id,
      userId: context.userRecord.id,
      tenantId: context.userRecord.tenantId,
      existingSub: context.existingSub,
      values: pastDueState.values,
    });
  }

  console.log(
    `[Webhook] 🚨 DUNNING: Subscription ${sub.id} is past_due (attempt ${pastDueState.newDunningCount})`
  );
  console.log(`[Webhook] Grace period ends: ${pastDueState.gracePeriodEnd.toISOString()}`);

  await logPastDueAuditEvent({
    deps,
    subscriptionId: sub.id,
    tenantId: context.userRecord.tenantId,
    newDunningCount: pastDueState.newDunningCount,
    gracePeriodEnd: pastDueState.gracePeriodEnd,
  });
  await sendInitialPaymentFailedEmail({
    deps,
    userId: context.userRecord.id,
    userRecord: context.userRecord,
    sub,
    newDunningCount: pastDueState.newDunningCount,
    gracePeriodEnd: pastDueState.gracePeriodEnd,
  });
}

async function persistPastDueSubscription(args: {
  subscriptionId: string;
  userId: string;
  tenantId: string;
  existingSub: ExistingSubscriptionRecord;
  values: PastDueValues;
}) {
  if (args.existingSub) {
    const existingSubId = args.existingSub.id;
    // db-access-guard: tenant-scoped -- reason: tenantId from canonical user/subscription context constrains dunning update
    await withTenantContext({ tenantId: args.tenantId }, async tx =>
      tx
        .update(subscriptions)
        .set(args.values)
        .where(and(eq(subscriptions.id, existingSubId), eq(subscriptions.tenantId, args.tenantId)))
    );
    return;
  }

  try {
    // db-access-guard: tenant-scoped -- reason: tenantId from canonical user context is included in dunning insert values
    await withTenantContext({ tenantId: args.tenantId }, async tx =>
      tx.insert(subscriptions).values({
        id: args.subscriptionId,
        ...args.values,
      })
    );
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const racedSubscription = await findExistingPastDueSubscriptionForUser({
      id: args.userId,
      tenantId: args.tenantId,
    });
    if (!racedSubscription) {
      throw error;
    }

    // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
    await withTenantContext({ tenantId: args.tenantId }, async tx =>
      tx
        .update(subscriptions)
        .set(args.values)
        .where(
          and(eq(subscriptions.id, racedSubscription.id), eq(subscriptions.tenantId, args.tenantId))
        )
    );
  }
}

async function logPastDueAuditEvent(args: {
  deps: PaddleWebhookAuditDeps;
  subscriptionId: string;
  tenantId: string | null;
  newDunningCount: number;
  gracePeriodEnd: Date;
}) {
  if (!args.deps.logAuditEvent) {
    return;
  }

  await args.deps.logAuditEvent({
    actorRole: 'system',
    action: 'subscription.past_due',
    entityType: 'subscription',
    entityId: args.subscriptionId,
    tenantId: args.tenantId,
    metadata: {
      dunningAttempt: args.newDunningCount,
      gracePeriodEnd: args.gracePeriodEnd.toISOString(),
    },
  });
}

async function sendInitialPaymentFailedEmail(args: {
  deps: Pick<PaddleWebhookDeps, 'sendPaymentFailedEmail'>;
  userId: string;
  userRecord: PastDueUserRecord;
  sub: SubscriptionEventData;
  newDunningCount: number;
  gracePeriodEnd: Date;
}) {
  if (args.newDunningCount !== 1 || !args.deps.sendPaymentFailedEmail) {
    return;
  }

  try {
    if (!args.userRecord.email) {
      console.warn(`[Webhook] No email found for user ${args.userId}`);
      return;
    }

    const planName = args.sub.items?.[0]?.price?.description || 'Membership';
    await args.deps.sendPaymentFailedEmail(args.userRecord.email, {
      memberName: args.userRecord.name || 'Member',
      planName,
      gracePeriodDays: DUNNING_GRACE_PERIOD_DAYS,
      gracePeriodEndDate: args.gracePeriodEnd.toLocaleDateString(),
    });
    console.log(`[Webhook] ✉️ Day 0 dunning email sent to ${redactEmail(args.userRecord.email)}`);
  } catch (emailError) {
    console.error('[Webhook] Failed to send dunning email:', emailError);
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code === '23505'
  );
}
