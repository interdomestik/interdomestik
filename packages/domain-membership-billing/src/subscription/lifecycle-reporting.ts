import { db, eq, sql, subscriptions } from '@interdomestik/database';

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
  const now = args.now ?? new Date();
  const nowTimestamp = now.toISOString();
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      active: sql<number>`COALESCE(SUM(CASE WHEN ${subscriptions.status} = 'active' AND COALESCE(${subscriptions.cancelAtPeriodEnd}, false) = false THEN 1 ELSE 0 END), 0)::int`,
      trialing: sql<number>`COALESCE(SUM(CASE WHEN ${subscriptions.status} = 'trialing' AND COALESCE(${subscriptions.cancelAtPeriodEnd}, false) = false THEN 1 ELSE 0 END), 0)::int`,
      activeInGrace: sql<number>`COALESCE(SUM(CASE WHEN ${subscriptions.status} = 'past_due' AND ${subscriptions.gracePeriodEndsAt} IS NOT NULL AND ${subscriptions.gracePeriodEndsAt} > ${nowTimestamp}::timestamp THEN 1 ELSE 0 END), 0)::int`,
      graceExpired: sql<number>`COALESCE(SUM(CASE WHEN ${subscriptions.status} = 'past_due' AND (${subscriptions.gracePeriodEndsAt} IS NULL OR ${subscriptions.gracePeriodEndsAt} <= ${nowTimestamp}::timestamp) THEN 1 ELSE 0 END), 0)::int`,
      scheduledCancel: sql<number>`COALESCE(SUM(CASE WHEN ${subscriptions.status} IN ('active', 'trialing') AND COALESCE(${subscriptions.cancelAtPeriodEnd}, false) = true THEN 1 ELSE 0 END), 0)::int`,
      canceled: sql<number>`COALESCE(SUM(CASE WHEN ${subscriptions.status} IN ('canceled', 'paused', 'expired') THEN 1 ELSE 0 END), 0)::int`,
      accessActive: sql<number>`COALESCE(SUM(CASE WHEN ${subscriptions.status} IN ('active', 'trialing') OR (${subscriptions.status} = 'past_due' AND ${subscriptions.gracePeriodEndsAt} IS NOT NULL AND ${subscriptions.gracePeriodEndsAt} > ${nowTimestamp}::timestamp) THEN 1 ELSE 0 END), 0)::int`,
    })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, args.tenantId));

  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    trialing: Number(row?.trialing ?? 0),
    activeInGrace: Number(row?.activeInGrace ?? 0),
    graceExpired: Number(row?.graceExpired ?? 0),
    scheduledCancel: Number(row?.scheduledCancel ?? 0),
    canceled: Number(row?.canceled ?? 0),
    none: 0,
    accessActive: Number(row?.accessActive ?? 0),
  };
}
