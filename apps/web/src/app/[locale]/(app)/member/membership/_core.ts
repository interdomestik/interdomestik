import { authorizeSessionUserTenant } from '@/lib/tenant-authority.server';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { resolveEffectiveMembership } from '@interdomestik/domain-membership-billing/sponsor-coverage';
import { listLeavableSponsorEntries } from '@interdomestik/domain-membership-billing/sponsors/opt-out';
import {
  and,
  eq,
  isNull,
  subscriptions,
  membershipPlans,
  type documents,
} from '@interdomestik/database';
import { attachMembershipEntityDisclosure, type SubscriptionRecord } from './_entity-disclosure';

export type { SubscriptionRecord } from './_entity-disclosure';

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
  const records = await getMemberSubscriptionsCore(args);
  const subscription = records[0] ?? null;

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
  now?: Date;
}): Promise<SubscriptionRecord[]> {
  if (!args.tenantId) return [];
  const authority = await authorizeSessionUserTenant(args.userId);
  if (!authority) return [];
  const { tenantId } = readTenantAuthority(authority);
  if (tenantId !== args.tenantId) return [];
  return withTenantAuthority(authority, async tx => {
    const resolved = await resolveEffectiveMembership(
      tx,
      tenantId,
      [args.userId],
      args.now ?? new Date()
    );
    const effective = resolved.get(args.userId);
    const records = await tx.query.subscriptions.findMany({
      where: and(eq(subscriptions.userId, args.userId), eq(subscriptions.tenantId, tenantId)),
      with: { plan: true },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });
    const row =
      effective?.source === 'subscription'
        ? records.find(record => record.id === effective.subscription.id)
        : records[0];
    if (!row) return [];
    if (effective?.source === 'sponsor') {
      const plan = await tx.query.membershipPlans.findFirst({
        where: and(
          eq(membershipPlans.tenantId, tenantId),
          eq(membershipPlans.id, effective.planId)
        ),
      });
      const record = await attachMembershipEntityDisclosure(
        {
          ...row,
          ...effective.lifecycle,
          planId: effective.planId,
          planKey: effective.planKey,
          currentPeriodStart: effective.windowStart,
          currentPeriodEnd: effective.windowEnd,
          canceledAt: null,
          plan: plan ?? null,
        },
        { authority, coverage: effective }
      );
      return [{ ...record, sponsorCoverage: effective }];
    }
    const record = await attachMembershipEntityDisclosure({
      ...row,
      ...(effective?.source === 'subscription'
        ? effective.subscription
        : { status: 'expired' as const }),
    });
    const [leaveEntryId] = await listLeavableSponsorEntries(
      tx,
      tenantId,
      args.userId,
      args.now ?? new Date()
    );
    return [leaveEntryId ? { ...record, sponsorLeaveEntryId: leaveEntryId } : record];
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

type SubscriptionDunningInput = DunningSubscription | null | undefined;
type DunningSubscription = { status?: string | null; gracePeriodEndsAt?: Date | null };

export async function getMemberDocumentsCore(args: {
  userId: string;
  tenantId: string | null | undefined;
}): Promise<(typeof documents.$inferSelect)[]> {
  const tenantId = args.tenantId;
  if (!tenantId) {
    return [];
  }

  const authority = await authorizeSessionUserTenant(args.userId);
  if (!authority || readTenantAuthority(authority).tenantId !== tenantId) return [];
  return withTenantAuthority(authority, db =>
    db.query.documents.findMany({
      where: (docs, { and: andFn, eq: eqFn }) =>
        andFn(
          eqFn(docs.entityType, 'member'),
          eqFn(docs.entityId, args.userId),
          eqFn(docs.tenantId, tenantId),
          isNull(docs.deletedAt)
        ),
      orderBy: (docs, { desc }) => [desc(docs.uploadedAt)],
    })
  );
}
