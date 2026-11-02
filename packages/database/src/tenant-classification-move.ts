import { and, eq } from 'drizzle-orm';
import { dbAdmin } from './db';
import { agentClients, memberNotes, membershipCards, membershipFamilyMembers } from './schema';
import {
  claims,
  emailCampaignLogs,
  memberLeads,
  memberReferralRewards,
  notifications,
  pushSubscriptions,
  referrals,
  subscriptions,
  tenants,
  user,
  userNotificationPreferences,
  userRoles,
} from './schema';

export type TenantClassificationMoveOutcome =
  | { outcome: 'moved'; previousPending: boolean }
  | { outcome: 'user_not_found' }
  | { outcome: 'target_tenant_not_found' }
  | { outcome: 'tenant_bound_records_exist' };

type Executor = Parameters<Parameters<typeof dbAdmin.transaction>[0]>[0];

async function hasTenantBoundRecords(tx: Executor, userId: string, tenantId: string) {
  const probes = [
    tx
      .select({ id: claims.id })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), eq(claims.userId, userId)))
      .limit(1),
    tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.userId, userId)))
      .limit(1),
    tx
      .select({ id: userNotificationPreferences.id })
      .from(userNotificationPreferences)
      .where(
        and(
          eq(userNotificationPreferences.tenantId, tenantId),
          eq(userNotificationPreferences.userId, userId)
        )
      )
      .limit(1),
    tx
      .select({ id: memberNotes.id })
      .from(memberNotes)
      .where(and(eq(memberNotes.tenantId, tenantId), eq(memberNotes.memberId, userId)))
      .limit(1),
    tx
      .select({ id: agentClients.id })
      .from(agentClients)
      .where(and(eq(agentClients.tenantId, tenantId), eq(agentClients.memberId, userId)))
      .limit(1),
    tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.tenantId, tenantId), eq(pushSubscriptions.userId, userId)))
      .limit(1),
    tx
      .select({ id: membershipCards.id })
      .from(membershipCards)
      .where(and(eq(membershipCards.tenantId, tenantId), eq(membershipCards.userId, userId)))
      .limit(1),
    tx
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(and(eq(userRoles.tenantId, tenantId), eq(userRoles.userId, userId)))
      .limit(1),
    tx
      .select({ id: memberLeads.id })
      .from(memberLeads)
      .where(and(eq(memberLeads.tenantId, tenantId), eq(memberLeads.convertedUserId, userId)))
      .limit(1),
    tx
      .select({ id: emailCampaignLogs.id })
      .from(emailCampaignLogs)
      .where(and(eq(emailCampaignLogs.tenantId, tenantId), eq(emailCampaignLogs.userId, userId)))
      .limit(1),
    tx
      .select({ id: membershipFamilyMembers.id })
      .from(membershipFamilyMembers)
      .where(
        and(
          eq(membershipFamilyMembers.tenantId, tenantId),
          eq(membershipFamilyMembers.userId, userId)
        )
      )
      .limit(1),
    tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId)))
      .limit(1),
    tx
      .select({ id: referrals.id })
      .from(referrals)
      .where(and(eq(referrals.tenantId, tenantId), eq(referrals.referrerId, userId)))
      .limit(1),
    tx
      .select({ id: memberReferralRewards.id })
      .from(memberReferralRewards)
      .where(
        and(
          eq(memberReferralRewards.tenantId, tenantId),
          eq(memberReferralRewards.referredMemberId, userId)
        )
      )
      .limit(1),
  ];
  for (const probe of probes) {
    if ((await probe).length > 0) return true;
  }
  return false;
}

/**
 * Moves a user from one tenant to another in one transaction: lock the user row (FOR UPDATE),
 * check target-tenant activity and the absence of the listed tenant-bound records in the source
 * tenant, then move the row with an affected-row check. The caller must already have authorized
 * the actor (super_admin) for the move; this function authenticates nobody and writes no audit.
 *
 * Limits (see review 081/A): the probes cover the listed relationship columns only, the user's
 * pending flag is reported, not required, and a dependent writer that read the user's tenant in an
 * earlier transaction can still insert an old-tenant row after this commits, because child foreign
 * keys reference user.id only. This is therefore not a guarantee that no old-tenant row can appear.
 * A single-tenant RLS context cannot perform this write (the new row fails the source tenant's
 * WITH CHECK), which is why it is a privileged command.
 */
export async function moveUserTenantClassification(params: {
  userId: string;
  fromTenantId: string;
  toTenantId: string;
}): Promise<TenantClassificationMoveOutcome> {
  const { userId, fromTenantId, toTenantId } = params;
  if (!userId || !fromTenantId || !toTenantId || fromTenantId === toTenantId) {
    return { outcome: 'user_not_found' };
  }

  // db-access-guard: system-exempt -- reason: atomic authorized cross-tenant user reassignment; fixed eligibility checks and affected-row outcome
  return dbAdmin.transaction(async tx => {
    const [current] = await tx
      .select({ id: user.id, pending: user.tenantClassificationPending })
      .from(user)
      .where(and(eq(user.id, userId), eq(user.tenantId, fromTenantId)))
      .for('update');
    if (!current) return { outcome: 'user_not_found' } as const;

    const [target] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(eq(tenants.id, toTenantId), eq(tenants.isActive, true)))
      .for('share');
    if (!target) return { outcome: 'target_tenant_not_found' } as const;

    if (await hasTenantBoundRecords(tx, userId, fromTenantId)) {
      return { outcome: 'tenant_bound_records_exist' } as const;
    }

    const moved = await tx
      .update(user)
      .set({ tenantId: toTenantId, tenantClassificationPending: false })
      .where(and(eq(user.id, userId), eq(user.tenantId, fromTenantId)))
      .returning({ id: user.id });
    if (moved.length !== 1) {
      throw new Error('Tenant classification move affected an unexpected number of rows');
    }
    return { outcome: 'moved', previousPending: current.pending === true } as const;
  });
}
