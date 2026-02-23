import { and, db, eq, subscriptions } from '@interdomestik/database';

export type MembershipDunningState = {
  isPastDue: boolean;
  isInGracePeriod: boolean;
  isGraceExpired: boolean;
  daysRemaining: number;
};

export type MembershipPageModel = {
  subscription: SubscriptionRecord | null;
  dunning: MembershipDunningState;
};

export async function getMembershipPageModelCore(args: {
  userId: string;
  tenantId: string | null | undefined;
  now?: Date;
}): Promise<MembershipPageModel> {
  const subscriptionResult = args.tenantId
    ? await db.query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.userId, args.userId),
          eq(subscriptions.tenantId, args.tenantId)
        ),
        with: {
          plan: true,
        },
      })
    : null;

  const subscription = (subscriptionResult ?? null) as SubscriptionRecord | null;

  return {
    subscription,
    dunning: computeDunningState({
      subscription,
      now: args.now,
    }),
  };
}

export async function getMemberSubscriptionsCore(args: {
  userId: string;
  tenantId: string | null | undefined;
}) {
  if (!args.tenantId) {
    return [];
  }

  return db.query.subscriptions.findMany({
    where: and(eq(subscriptions.userId, args.userId), eq(subscriptions.tenantId, args.tenantId)),
    with: {
      plan: true,
    },
    orderBy: (subscriptions, { desc }) => [desc(subscriptions.createdAt)],
  });
}

export function computeDunningState(args: {
  subscription: SubscriptionDunningInput;
  now?: Date;
}): MembershipDunningState {
  const now = args.now ?? new Date();
  const subscription = args.subscription;

  const isPastDue = subscription?.status === 'past_due';
  const gracePeriodEndsAt = subscription?.gracePeriodEndsAt ?? null;

  const isInGracePeriod =
    isPastDue && !!gracePeriodEndsAt && !isGracePeriodExpired({ endDate: gracePeriodEndsAt, now });

  const daysRemaining = getDaysRemaining({ endDate: gracePeriodEndsAt, now });

  const isGraceExpired = isPastDue && isGracePeriodExpired({ endDate: gracePeriodEndsAt, now });

  return {
    isPastDue,
    isInGracePeriod,
    isGraceExpired,
    daysRemaining,
  };
}

export function getDaysRemaining(args: { endDate: Date | null; now?: Date }): number {
  const endDate = args.endDate;
  if (!endDate) return 0;
  const now = args.now ?? new Date();
  const diff = endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function isGracePeriodExpired(args: { endDate: Date | null; now?: Date }): boolean {
  const endDate = args.endDate;
  if (!endDate) return false;
  const now = args.now ?? new Date();
  return now.getTime() > endDate.getTime();
}

function getSubscriptionWithPlanQuery() {
  return db.query.subscriptions.findFirst({
    with: {
      plan: true,
    },
  });
}

export type SubscriptionRecord = NonNullable<
  Awaited<ReturnType<typeof getSubscriptionWithPlanQuery>>
>;

type SubscriptionDunningInput =
  | {
      status?: string | null;
      gracePeriodEndsAt?: Date | null;
    }
  | null
  | undefined;

export async function getMemberDocumentsCore(args: {
  userId: string;
  tenantId: string | null | undefined;
}) {
  const tenantId = args.tenantId;
  if (!tenantId) {
    return [];
  }

  return db.query.documents.findMany({
    where: (docs, { and: andFn, eq: eqFn }) =>
      andFn(
        eqFn(docs.entityType, 'member'),
        eqFn(docs.entityId, args.userId),
        eqFn(docs.tenantId, tenantId)
      ),
    orderBy: (docs, { desc }) => [desc(docs.uploadedAt)],
  });
}
