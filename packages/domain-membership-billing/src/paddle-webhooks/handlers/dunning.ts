import { and, db, eq, subscriptions } from '@interdomestik/database';
import {
  createCanonicalMembershipPlanState,
  resolveCanonicalMembershipPlanState,
} from '../../annual-membership';

import { RetryablePaddleWebhookError } from '../errors';
import { subscriptionEventDataSchema } from '../schemas';
import type { PaddleWebhookAuditDeps, PaddleWebhookDeps } from '../types';
import {
  findExistingPastDueSubscriptionForUser,
  resolvePastDueContext,
  type ExistingSubscriptionRecord,
  type PastDueUserRecord,
} from './dunning-context';
import { persistOrderedPastDueSubscription } from './dunning-order';
import { resolveSubscriptionEventOrder } from './subscription-event-order';

type SubscriptionEventData = ReturnType<typeof subscriptionEventDataSchema.parse>;
type PastDueValues = {
  tenantId: string;
  userId: string;
  status: 'past_due';
  planId: string;
  planKey?: string;
  providerSubscriptionId: string;
  providerCustomerId: string | null | undefined;
  pastDueAt: Date;
  gracePeriodEndsAt: Date;
  dunningAttemptCount: number;
  lastDunningAt: Date;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  updatedAt: Date;
};

const DUNNING_GRACE_PERIOD_DAYS = 14;

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
  deps: Pick<PaddleWebhookDeps, 'sendPaymentFailedEmail'> & PaddleWebhookAuditDeps = {}
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
    const ordered = await persistOrderedPastDueSubscription({
      order,
      providerSubscriptionId: sub.id,
      subscriptionId: context.existingSub.id,
      tenantId: context.userRecord.tenantId,
      buildState,
    });
    if (ordered.kind !== 'apply') {
      console.warn(
        `[Webhook] Ignored ${ordered.kind} past_due event ${order.providerEventId} for subscription ${sub.id}`
      );
      return;
    }
    pastDueState = ordered.state;
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

function parsePastDueSubscription(data: unknown): SubscriptionEventData | null {
  const parseResult = subscriptionEventDataSchema.safeParse(data);
  if (!parseResult.success) {
    console.error('[Webhook] Invalid dunning data:', parseResult.error);
    return null;
  }

  return parseResult.data;
}

function buildPastDueState(args: {
  sub: SubscriptionEventData;
  userId: string;
  userRecord: PastDueUserRecord;
  existingSub: ExistingSubscriptionRecord;
  now: Date;
  planState: {
    planId: string;
    planKey: string | null;
  };
}): { values: PastDueValues; gracePeriodEnd: Date; newDunningCount: number } {
  const gracePeriodEnd = args.existingSub?.gracePeriodEndsAt ?? calculateGracePeriodEnd(args.now);
  const newDunningCount = (args.existingSub?.dunningAttemptCount ?? 0) + 1;

  return {
    gracePeriodEnd,
    newDunningCount,
    values: {
      tenantId: args.userRecord.tenantId,
      userId: args.userId,
      status: 'past_due',
      ...createCanonicalMembershipPlanState(args.planState.planId, args.planState.planKey),
      providerSubscriptionId: args.sub.id,
      providerCustomerId: args.sub.customerId || args.sub.customer_id,
      pastDueAt: args.existingSub?.pastDueAt ?? args.now,
      gracePeriodEndsAt: gracePeriodEnd,
      dunningAttemptCount: newDunningCount,
      lastDunningAt: args.now,
      currentPeriodStart: resolveBillingPeriodDate(
        args.sub.currentBillingPeriod?.startsAt,
        args.sub.current_billing_period?.starts_at as string | null | undefined
      ),
      currentPeriodEnd: resolveBillingPeriodDate(
        args.sub.currentBillingPeriod?.endsAt,
        args.sub.current_billing_period?.ends_at as string | null | undefined
      ),
      updatedAt: args.now,
    },
  };
}

function calculateGracePeriodEnd(now: Date): Date {
  const gracePeriodEnd = new Date(now);
  gracePeriodEnd.setDate(now.getDate() + DUNNING_GRACE_PERIOD_DAYS);
  return gracePeriodEnd;
}

function resolveBillingPeriodDate(primary?: string | null, fallback?: string | null): Date | null {
  const rawValue = primary || fallback;
  return rawValue ? new Date(rawValue) : null;
}

async function persistPastDueSubscription(args: {
  subscriptionId: string;
  userId: string;
  tenantId: string;
  existingSub: ExistingSubscriptionRecord;
  values: PastDueValues;
}) {
  if (args.existingSub) {
    // db-access-guard: tenant-scoped -- reason: tenantId from canonical user/subscription context constrains dunning update
    await db
      .update(subscriptions)
      .set(args.values)
      .where(
        and(eq(subscriptions.id, args.existingSub.id), eq(subscriptions.tenantId, args.tenantId))
      );
    return;
  }

  try {
    // db-access-guard: tenant-scoped -- reason: tenantId from canonical user context is included in dunning insert values
    await db.insert(subscriptions).values({
      id: args.subscriptionId,
      ...args.values,
    });
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
    await db
      .update(subscriptions)
      .set(args.values)
      .where(
        and(eq(subscriptions.id, racedSubscription.id), eq(subscriptions.tenantId, args.tenantId))
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
