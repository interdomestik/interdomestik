import { db, eq, subscriptions } from '@interdomestik/database';

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
  now?: Date;
}): Promise<MembershipPageModel> {
  const subscriptionResult = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, args.userId),
    with: {
      plan: true,
    },
  });

  const subscription = (subscriptionResult ?? null) as SubscriptionRecord | null;

  return {
    subscription,
    dunning: computeDunningState({
      subscription,
      now: args.now,
    }),
  };
}

export async function getMemberSubscriptionsCore(userId: string) {
  return db.query.subscriptions.findMany({
    where: eq(subscriptions.userId, userId),
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

export const _subscriptionQuery = db.query.subscriptions.findFirst({
  with: {
    plan: true,
  },
});

export type SubscriptionRecord = NonNullable<Awaited<typeof _subscriptionQuery>>;

type SubscriptionDunningInput =
  | {
      status?: string | null;
      gracePeriodEndsAt?: Date | null;
    }
  | null
  | undefined;

export async function getMemberDocumentsCore(userId: string) {
  return db.query.documents.findMany({
    where: (docs, { and, eq }) => and(eq(docs.entityType, 'member'), eq(docs.entityId, userId)),
    orderBy: (docs, { desc }) => [desc(docs.uploadedAt)],
  });
}
