import {
  agentClients,
  and,
  claims,
  db,
  emailCampaignLogs,
  eq,
  memberLeads,
  memberNotes,
  membershipCards,
  membershipFamilyMembers,
  notifications,
  pushSubscriptions,
  referrals,
  subscriptions,
  tenants,
  user,
  userNotificationPreferences,
  userRoles,
  memberReferralRewards,
} from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ActionResult, UserSession } from '../types';
import { requireTenantAdminSession } from './access';
import { resolveTenantId } from './utils';

export type TenantClassificationResolutionMode = 'confirm_current' | 'reassign';

export type ResolveTenantClassificationResult = {
  previousTenantId: string;
  tenantId: string;
  previousPending: boolean;
  tenantClassificationPending: boolean;
  resolutionMode: TenantClassificationResolutionMode;
};

async function hasTenantBoundRecords(params: {
  userId: string;
  tenantId: string;
}): Promise<boolean> {
  const { userId, tenantId } = params;

  const [
    claimRow,
    subscriptionRow,
    preferenceRow,
    noteRow,
    agentClientRow,
    pushSubscriptionRow,
    membershipCardRow,
    userRoleRow,
    leadRow,
    emailCampaignLogRow,
    familyMemberRow,
    notificationRow,
    referralRow,
    rewardRow,
  ] = await Promise.all([
    db.query.claims.findFirst({
      where: and(eq(claims.userId, userId), eq(claims.tenantId, tenantId)),
      columns: { id: true },
    }),
    db.query.subscriptions.findFirst({
      where: and(eq(subscriptions.userId, userId), eq(subscriptions.tenantId, tenantId)),
      columns: { id: true },
    }),
    db.query.userNotificationPreferences.findFirst({
      where: and(
        eq(userNotificationPreferences.userId, userId),
        eq(userNotificationPreferences.tenantId, tenantId)
      ),
      columns: { id: true },
    }),
    db.query.memberNotes.findFirst({
      where: and(eq(memberNotes.memberId, userId), eq(memberNotes.tenantId, tenantId)),
      columns: { id: true },
    }),
    db.query.agentClients.findFirst({
      where: and(eq(agentClients.memberId, userId), eq(agentClients.tenantId, tenantId)),
      columns: { id: true },
    }),
    db.query.pushSubscriptions.findFirst({
      where: and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.tenantId, tenantId)),
      columns: { id: true },
    }),
    db.query.membershipCards.findFirst({
      where: and(eq(membershipCards.userId, userId), eq(membershipCards.tenantId, tenantId)),
      columns: { id: true },
    }),
    db.query.userRoles.findFirst({
      where: and(eq(userRoles.userId, userId), eq(userRoles.tenantId, tenantId)),
      columns: { id: true },
    }),
    db.query.memberLeads.findFirst({
      where: and(eq(memberLeads.convertedUserId, userId), eq(memberLeads.tenantId, tenantId)),
      columns: { id: true },
    }),
    db.query.emailCampaignLogs.findFirst({
      where: and(eq(emailCampaignLogs.userId, userId), eq(emailCampaignLogs.tenantId, tenantId)),
      columns: { id: true },
    }),
    db.query.membershipFamilyMembers.findFirst({
      where: and(
        eq(membershipFamilyMembers.userId, userId),
        eq(membershipFamilyMembers.tenantId, tenantId)
      ),
      columns: { id: true },
    }),
    db.query.notifications.findFirst({
      where: and(eq(notifications.userId, userId), eq(notifications.tenantId, tenantId)),
      columns: { id: true },
    }),
    db.query.referrals.findFirst({
      where: and(eq(referrals.referrerId, userId), eq(referrals.tenantId, tenantId)),
      columns: { id: true },
    }),
    db.query.memberReferralRewards.findFirst({
      where: and(
        eq(memberReferralRewards.referredMemberId, userId),
        eq(memberReferralRewards.tenantId, tenantId)
      ),
      columns: { id: true },
    }),
  ]);

  return Boolean(
    claimRow ||
    subscriptionRow ||
    preferenceRow ||
    noteRow ||
    agentClientRow ||
    pushSubscriptionRow ||
    membershipCardRow ||
    userRoleRow ||
    leadRow ||
    emailCampaignLogRow ||
    familyMemberRow ||
    notificationRow ||
    referralRow ||
    rewardRow
  );
}

export async function resolveTenantClassificationCore(params: {
  session: UserSession | null;
  userId: string;
  currentTenantId: string;
  targetTenantId?: string | null;
}): Promise<ActionResult<ResolveTenantClassificationResult>> {
  const adminSession = await requireTenantAdminSession(params.session);
  const sessionTenantId = ensureTenantId(adminSession);

  if (!params.userId.trim()) {
    return { error: 'User ID is required' };
  }

  const currentTenantId = params.currentTenantId.trim();
  if (!currentTenantId) {
    return { error: 'Current tenant is required' };
  }

  if (adminSession.user.role !== 'super_admin' && currentTenantId !== sessionTenantId) {
    return { error: 'Unauthorized' };
  }

  let nextTenantId: string;
  try {
    nextTenantId = resolveTenantId(adminSession, params.targetTenantId ?? null);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return { error: 'Unauthorized' };
    }
    throw error;
  }

  const resolutionMode: TenantClassificationResolutionMode =
    nextTenantId === currentTenantId ? 'confirm_current' : 'reassign';

  try {
    const currentUser = await db.query.user.findFirst({
      where: and(eq(user.id, params.userId), eq(user.tenantId, currentTenantId)),
      columns: {
        id: true,
        tenantId: true,
        tenantClassificationPending: true,
      },
    });

    if (!currentUser) {
      return { error: 'User not found' };
    }

    if (resolutionMode === 'reassign') {
      const targetTenant = await db.query.tenants.findFirst({
        where: and(eq(tenants.id, nextTenantId), eq(tenants.isActive, true)),
        columns: { id: true },
      });

      if (!targetTenant) {
        return { error: 'Target tenant not found' };
      }

      if (await hasTenantBoundRecords({ userId: params.userId, tenantId: currentTenantId })) {
        return {
          error: 'Cannot reassign tenant classification while tenant-bound records exist',
        };
      }
    }

    await db.transaction(async tx => {
      await tx
        .update(user)
        .set({
          tenantId: nextTenantId,
          tenantClassificationPending: false,
        })
        .where(and(eq(user.id, params.userId), eq(user.tenantId, currentTenantId)));
    });

    return {
      success: true,
      data: {
        previousTenantId: currentTenantId,
        tenantId: nextTenantId,
        previousPending: currentUser.tenantClassificationPending === true,
        tenantClassificationPending: false,
        resolutionMode,
      },
    };
  } catch (error) {
    console.error('Failed to resolve tenant classification:', error);
    return { error: 'Failed to resolve tenant classification' };
  }
}
