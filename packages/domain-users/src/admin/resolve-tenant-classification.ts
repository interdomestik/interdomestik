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
import { withTenant } from '@interdomestik/database/tenant-security';
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

type TenantResolutionContext = {
  currentTenantId: string;
  nextTenantId: string;
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
      where: withTenant(tenantId, claims.tenantId, eq(claims.userId, userId)),
      columns: { id: true },
    }),
    db.query.subscriptions.findFirst({
      where: withTenant(tenantId, subscriptions.tenantId, eq(subscriptions.userId, userId)),
      columns: { id: true },
    }),
    db.query.userNotificationPreferences.findFirst({
      where: withTenant(
        tenantId,
        userNotificationPreferences.tenantId,
        eq(userNotificationPreferences.userId, userId)
      ),
      columns: { id: true },
    }),
    db.query.memberNotes.findFirst({
      where: withTenant(tenantId, memberNotes.tenantId, eq(memberNotes.memberId, userId)),
      columns: { id: true },
    }),
    db.query.agentClients.findFirst({
      where: withTenant(tenantId, agentClients.tenantId, eq(agentClients.memberId, userId)),
      columns: { id: true },
    }),
    db.query.pushSubscriptions.findFirst({
      where: withTenant(tenantId, pushSubscriptions.tenantId, eq(pushSubscriptions.userId, userId)),
      columns: { id: true },
    }),
    db.query.membershipCards.findFirst({
      where: withTenant(tenantId, membershipCards.tenantId, eq(membershipCards.userId, userId)),
      columns: { id: true },
    }),
    db.query.userRoles.findFirst({
      where: withTenant(tenantId, userRoles.tenantId, eq(userRoles.userId, userId)),
      columns: { id: true },
    }),
    db.query.memberLeads.findFirst({
      where: withTenant(tenantId, memberLeads.tenantId, eq(memberLeads.convertedUserId, userId)),
      columns: { id: true },
    }),
    db.query.emailCampaignLogs.findFirst({
      where: withTenant(tenantId, emailCampaignLogs.tenantId, eq(emailCampaignLogs.userId, userId)),
      columns: { id: true },
    }),
    db.query.membershipFamilyMembers.findFirst({
      where: withTenant(
        tenantId,
        membershipFamilyMembers.tenantId,
        eq(membershipFamilyMembers.userId, userId)
      ),
      columns: { id: true },
    }),
    db.query.notifications.findFirst({
      where: withTenant(tenantId, notifications.tenantId, eq(notifications.userId, userId)),
      columns: { id: true },
    }),
    db.query.referrals.findFirst({
      where: withTenant(tenantId, referrals.tenantId, eq(referrals.referrerId, userId)),
      columns: { id: true },
    }),
    db.query.memberReferralRewards.findFirst({
      where: withTenant(
        tenantId,
        memberReferralRewards.tenantId,
        eq(memberReferralRewards.referredMemberId, userId)
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

async function validateResolutionInput(params: {
  session: UserSession | null;
  userId: string;
  currentTenantId: string;
  targetTenantId?: string | null;
}): Promise<ActionResult<TenantResolutionContext>> {
  const { session, userId, currentTenantId, targetTenantId } = params;
  try {
    const adminSession = await requireTenantAdminSession(session);
    const sessionTenantId = ensureTenantId(adminSession);

    if (!userId.trim()) {
      return { error: 'User ID is required' };
    }

    const normalizedCurrentTenantId = currentTenantId.trim();
    if (!normalizedCurrentTenantId) {
      return { error: 'Current tenant is required' };
    }

    if (adminSession.user.role !== 'super_admin' && normalizedCurrentTenantId !== sessionTenantId) {
      return { error: 'Unauthorized' };
    }

    const nextTenantId = resolveTenantId(adminSession, targetTenantId ?? null);

    return {
      success: true,
      data: {
        currentTenantId: normalizedCurrentTenantId,
        nextTenantId,
        resolutionMode: nextTenantId === normalizedCurrentTenantId ? 'confirm_current' : 'reassign',
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return { error: 'Unauthorized' };
    }
    throw error;
  }
}

async function getPendingUser(userId: string, currentTenantId: string) {
  return db.query.user.findFirst({
    where: withTenant(currentTenantId, user.tenantId, eq(user.id, userId)),
    columns: {
      id: true,
      tenantId: true,
      tenantClassificationPending: true,
    },
  });
}

async function validateReassignment(params: {
  userId: string;
  currentTenantId: string;
  nextTenantId: string;
}) {
  const { userId, currentTenantId, nextTenantId } = params;
  const targetTenant = await db.query.tenants.findFirst({
    where: and(eq(tenants.id, nextTenantId), eq(tenants.isActive, true)),
    columns: { id: true },
  });

  if (!targetTenant) {
    return { error: 'Target tenant not found' } as const;
  }

  if (await hasTenantBoundRecords({ userId, tenantId: currentTenantId })) {
    return {
      error: 'Cannot reassign tenant classification while tenant-bound records exist',
    } as const;
  }

  return { success: true } as const;
}

export async function resolveTenantClassificationCore(params: {
  session: UserSession | null;
  userId: string;
  currentTenantId: string;
  targetTenantId?: string | null;
}): Promise<ActionResult<ResolveTenantClassificationResult>> {
  const validation = await validateResolutionInput(params);
  if ('error' in validation) {
    return validation;
  }

  if (!validation.data) {
    return { error: 'Failed to resolve tenant classification' };
  }

  const { currentTenantId, nextTenantId, resolutionMode } = validation.data;

  try {
    const currentUser = await getPendingUser(params.userId, currentTenantId);
    if (!currentUser) {
      return { error: 'User not found' };
    }

    if (resolutionMode === 'reassign') {
      const reassignmentValidation = await validateReassignment({
        userId: params.userId,
        currentTenantId,
        nextTenantId,
      });
      if ('error' in reassignmentValidation) {
        return reassignmentValidation;
      }
    }

    await db.transaction(async tx => {
      await tx
        .update(user)
        .set({
          tenantId: nextTenantId,
          tenantClassificationPending: false,
        })
        .where(withTenant(currentTenantId, user.tenantId, eq(user.id, params.userId)));
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
