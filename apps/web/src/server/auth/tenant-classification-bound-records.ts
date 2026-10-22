import {
  agentClients,
  claims,
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
  userNotificationPreferences,
  userRoles,
  memberReferralRewards,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

import type { ReassignmentTransaction } from './reassign-tenant-classification';

export async function hasTenantBoundRecords(
  database: ReassignmentTransaction,
  params: {
    userId: string;
    tenantId: string;
  }
): Promise<boolean> {
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
    database.query.claims.findFirst({
      where: withTenant(tenantId, claims.tenantId, eq(claims.userId, userId)),
      columns: { id: true },
    }),
    database.query.subscriptions.findFirst({
      where: withTenant(tenantId, subscriptions.tenantId, eq(subscriptions.userId, userId)),
      columns: { id: true },
    }),
    database.query.userNotificationPreferences.findFirst({
      where: withTenant(
        tenantId,
        userNotificationPreferences.tenantId,
        eq(userNotificationPreferences.userId, userId)
      ),
      columns: { id: true },
    }),
    database.query.memberNotes.findFirst({
      where: withTenant(tenantId, memberNotes.tenantId, eq(memberNotes.memberId, userId)),
      columns: { id: true },
    }),
    database.query.agentClients.findFirst({
      where: withTenant(tenantId, agentClients.tenantId, eq(agentClients.memberId, userId)),
      columns: { id: true },
    }),
    database.query.pushSubscriptions.findFirst({
      where: withTenant(tenantId, pushSubscriptions.tenantId, eq(pushSubscriptions.userId, userId)),
      columns: { id: true },
    }),
    database.query.membershipCards.findFirst({
      where: withTenant(tenantId, membershipCards.tenantId, eq(membershipCards.userId, userId)),
      columns: { id: true },
    }),
    database.query.userRoles.findFirst({
      where: withTenant(tenantId, userRoles.tenantId, eq(userRoles.userId, userId)),
      columns: { id: true },
    }),
    database.query.memberLeads.findFirst({
      where: withTenant(tenantId, memberLeads.tenantId, eq(memberLeads.convertedUserId, userId)),
      columns: { id: true },
    }),
    database.query.emailCampaignLogs.findFirst({
      where: withTenant(tenantId, emailCampaignLogs.tenantId, eq(emailCampaignLogs.userId, userId)),
      columns: { id: true },
    }),
    database.query.membershipFamilyMembers.findFirst({
      where: withTenant(
        tenantId,
        membershipFamilyMembers.tenantId,
        eq(membershipFamilyMembers.userId, userId)
      ),
      columns: { id: true },
    }),
    database.query.notifications.findFirst({
      where: withTenant(tenantId, notifications.tenantId, eq(notifications.userId, userId)),
      columns: { id: true },
    }),
    database.query.referrals.findFirst({
      where: withTenant(tenantId, referrals.tenantId, eq(referrals.referrerId, userId)),
      columns: { id: true },
    }),
    database.query.memberReferralRewards.findFirst({
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
