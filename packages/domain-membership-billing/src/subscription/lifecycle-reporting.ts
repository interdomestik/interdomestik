import { db, eq, subscriptions } from '@interdomestik/database';

export type MembershipLifecycleStatus =
  | 'active'
  | 'trialing'
  | 'active_in_grace'
  | 'grace_expired'
  | 'scheduled_cancel'
  | 'canceled';

export type LifecycleStatus = MembershipLifecycleStatus;
export type MembershipLifecycleBucket = MembershipLifecycleStatus | 'none';

export type MembershipLifecycleInput =
  | {
      status?: string | null;
      cancelAtPeriodEnd?: boolean | null;
      gracePeriodEndsAt?: Date | null;
    }
  | null
  | undefined;

export type MembershipLifecycleCounts = {
  total: number;
  active: number;
  trialing: number;
  activeInGrace: number;
  graceExpired: number;
  scheduledCancel: number;
  canceled: number;
  none: number;
  accessActive: number;
};

export function getMembershipLifecycleBucket(args: {
  subscription: MembershipLifecycleInput;
  now?: Date;
}): MembershipLifecycleBucket {
  if (!args.subscription) return 'none';

  return deriveMembershipStatus(args.subscription, args.now ?? new Date());
}

export function deriveMembershipStatus(
  subscription: NonNullable<MembershipLifecycleInput>,
  now: Date = new Date()
): MembershipLifecycleStatus {
  const status = subscription.status;
  if (status === 'canceled' || status === 'paused' || status === 'expired') return 'canceled';

  if (status === 'past_due') {
    return isSubscriptionInsideGracePeriod({
      gracePeriodEndsAt: subscription.gracePeriodEndsAt ?? null,
      now,
    })
      ? 'active_in_grace'
      : 'grace_expired';
  }

  if (subscription.cancelAtPeriodEnd === true && (status === 'active' || status === 'trialing')) {
    return 'scheduled_cancel';
  }

  if (status === 'trialing') return 'trialing';
  if (status === 'active') return 'active';

  return 'canceled';
}

export function membershipLifecycleGrantsAccess(bucket: MembershipLifecycleBucket): boolean {
  return (
    bucket === 'active' ||
    bucket === 'trialing' ||
    bucket === 'active_in_grace' ||
    bucket === 'scheduled_cancel'
  );
}

export function isSubscriptionInsideGracePeriod(args: {
  gracePeriodEndsAt: Date | null;
  now: Date;
}): boolean {
  const gracePeriodEndsAt = args.gracePeriodEndsAt;
  if (!gracePeriodEndsAt) return false;

  return args.now.getTime() < gracePeriodEndsAt.getTime();
}

export function createEmptyMembershipLifecycleCounts(): MembershipLifecycleCounts {
  return {
    total: 0,
    active: 0,
    trialing: 0,
    activeInGrace: 0,
    graceExpired: 0,
    scheduledCancel: 0,
    canceled: 0,
    none: 0,
    accessActive: 0,
  };
}

export function summarizeMembershipLifecycle(
  rows: MembershipLifecycleInput[],
  now?: Date
): MembershipLifecycleCounts {
  const counts = createEmptyMembershipLifecycleCounts();

  for (const subscription of rows) {
    const bucket = getMembershipLifecycleBucket({ subscription, now });
    counts.total += 1;

    if (bucket === 'active') counts.active += 1;
    else if (bucket === 'trialing') counts.trialing += 1;
    else if (bucket === 'active_in_grace') counts.activeInGrace += 1;
    else if (bucket === 'grace_expired') counts.graceExpired += 1;
    else if (bucket === 'scheduled_cancel') counts.scheduledCancel += 1;
    else if (bucket === 'canceled') counts.canceled += 1;
    else counts.none += 1;

    if (membershipLifecycleGrantsAccess(bucket)) {
      counts.accessActive += 1;
    }
  }

  return counts;
}

export async function getTenantMembershipLifecycleCounts(args: {
  tenantId: string;
  now?: Date;
}): Promise<MembershipLifecycleCounts> {
  const rows = await db
    .select({
      status: subscriptions.status,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      gracePeriodEndsAt: subscriptions.gracePeriodEndsAt,
    })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, args.tenantId));

  return summarizeMembershipLifecycle(rows, args.now);
}
