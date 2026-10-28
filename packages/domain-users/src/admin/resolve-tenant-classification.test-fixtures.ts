export const classificationSchema = {
  user: {
    id: 'user.id',
    tenantId: 'user.tenantId',
    tenantClassificationPending: 'user.tenantClassificationPending',
  },
  tenants: {
    id: 'tenants.id',
    isActive: 'tenants.isActive',
  },
  claims: {
    tenantId: 'claims.tenantId',
    userId: 'claims.userId',
  },
  subscriptions: {
    tenantId: 'subscriptions.tenantId',
    userId: 'subscriptions.userId',
  },
  userNotificationPreferences: {
    tenantId: 'userNotificationPreferences.tenantId',
    userId: 'userNotificationPreferences.userId',
  },
  memberNotes: {
    tenantId: 'memberNotes.tenantId',
    memberId: 'memberNotes.memberId',
  },
  notifications: {
    tenantId: 'notifications.tenantId',
    userId: 'notifications.userId',
  },
  pushSubscriptions: {
    tenantId: 'pushSubscriptions.tenantId',
    userId: 'pushSubscriptions.userId',
  },
  userRoles: {
    tenantId: 'userRoles.tenantId',
    userId: 'userRoles.userId',
  },
  agentClients: {
    tenantId: 'agentClients.tenantId',
    memberId: 'agentClients.memberId',
  },
  membershipCards: {
    tenantId: 'membershipCards.tenantId',
    userId: 'membershipCards.userId',
  },
  memberLeads: {
    tenantId: 'memberLeads.tenantId',
    convertedUserId: 'memberLeads.convertedUserId',
  },
  emailCampaignLogs: {
    tenantId: 'emailCampaignLogs.tenantId',
    userId: 'emailCampaignLogs.userId',
  },
  membershipFamilyMembers: {
    tenantId: 'membershipFamilyMembers.tenantId',
    userId: 'membershipFamilyMembers.userId',
  },
  referrals: {
    tenantId: 'referrals.tenantId',
    referrerId: 'referrals.referrerId',
  },
  memberReferralRewards: {
    tenantId: 'memberReferralRewards.tenantId',
    referredMemberId: 'memberReferralRewards.referredMemberId',
  },
};
