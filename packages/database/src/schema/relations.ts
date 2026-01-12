import { relations } from 'drizzle-orm';

// Import all tables
import { agentClients, agentCommissions, agentSettings } from './agents';
import { user } from './auth';
import { claimDocuments, claimMessages, claims, claimStageHistory } from './claims';
import { crmActivities, crmDeals, crmLeads, memberActivities } from './crm';
import { membershipFamilyMembers, membershipPlans, subscriptions } from './memberships';
import { auditLog, memberNotes } from './notes';
import { emailCampaignLogs, notifications } from './notifications';
import { branches, userRoles } from './rbac';
import { partnerDiscountUsage, referrals, serviceRequests, serviceUsage } from './services';
import { tenants, tenantSettings } from './tenants';

// User relations
export const userRelations = relations(user, ({ many, one }) => ({
  tenant: one(tenants, { fields: [user.tenantId], references: [tenants.id] }),
  roles: many(userRoles),
  claims: many(claims),
  staffClaims: many(claims, { relationName: 'claim_staff' }),
  auditLogs: many(auditLog),
  subscriptions: many(subscriptions, { relationName: 'user_subscriptions' }),
  referredSubscriptions: many(subscriptions, { relationName: 'agent_referred_subscriptions' }),
  agentClients: many(agentClients, { relationName: 'agent_clients_agent' }),
  memberAgents: many(agentClients, { relationName: 'agent_clients_member' }),
  commissions: many(agentCommissions),
  agentSettings: one(agentSettings, {
    fields: [user.id],
    references: [agentSettings.agentId],
  }),
  agent: one(user, {
    fields: [user.agentId],
    references: [user.id],
    relationName: 'user_agent',
  }),
  clients: many(user, { relationName: 'user_agent' }),
  crmLeads: many(crmLeads),
  crmActivities: many(crmActivities),
  memberActivities: many(memberActivities, { relationName: 'agent_member_activities' }),
  memberActivityHistory: many(memberActivities, { relationName: 'member_activity_history' }),
  crmDeals: many(crmDeals),
  referralsSent: many(referrals, { relationName: 'referrer' }),
  referralsReceived: many(referrals, { relationName: 'referred' }),
  serviceUsage: many(serviceUsage),
  serviceRequests: many(serviceRequests),
  handledServiceRequests: many(serviceRequests, { relationName: 'service_request_handler' }),
  partnerDiscountUsage: many(partnerDiscountUsage),
  notifications: many(notifications),
  emailCampaignLogs: many(emailCampaignLogs),
}));

export const tenantsRelations = relations(tenants, ({ many }) => ({
  settings: many(tenantSettings),
  branches: many(branches),
  userRoles: many(userRoles),
}));

export const tenantSettingsRelations = relations(tenantSettings, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantSettings.tenantId], references: [tenants.id] }),
}));

export const branchesRelations = relations(branches, ({ many, one }) => ({
  tenant: one(tenants, { fields: [branches.tenantId], references: [tenants.id] }),
  roles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  tenant: one(tenants, { fields: [userRoles.tenantId], references: [tenants.id] }),
  user: one(user, { fields: [userRoles.userId], references: [user.id] }),
  branch: one(branches, { fields: [userRoles.branchId], references: [branches.id] }),
}));

// Claims relations
export const claimsRelations = relations(claims, ({ one, many }) => ({
  user: one(user, { fields: [claims.userId], references: [user.id] }),
  staff: one(user, {
    fields: [claims.staffId],
    references: [user.id],
    relationName: 'claim_staff',
  }),
  branch: one(branches, { fields: [claims.branchId], references: [branches.id] }),
  documents: many(claimDocuments),
  messages: many(claimMessages),
  stageHistory: many(claimStageHistory),
}));

export const claimDocumentsRelations = relations(claimDocuments, ({ one }) => ({
  claim: one(claims, { fields: [claimDocuments.claimId], references: [claims.id] }),
}));

export const claimMessagesRelations = relations(claimMessages, ({ one }) => ({
  claim: one(claims, { fields: [claimMessages.claimId], references: [claims.id] }),
  sender: one(user, { fields: [claimMessages.senderId], references: [user.id] }),
}));

export const claimStageHistoryRelations = relations(claimStageHistory, ({ one }) => ({
  claim: one(claims, { fields: [claimStageHistory.claimId], references: [claims.id] }),
  changedBy: one(user, { fields: [claimStageHistory.changedById], references: [user.id] }),
}));

// Audit relations
export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, { fields: [auditLog.actorId], references: [user.id] }),
}));

// Membership relations
export const membershipPlansRelations = relations(membershipPlans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(user, {
    fields: [subscriptions.userId],
    references: [user.id],
    relationName: 'user_subscriptions',
  }),
  plan: one(membershipPlans, { fields: [subscriptions.planKey], references: [membershipPlans.id] }),
  familyMembers: many(membershipFamilyMembers),
  referredByAgent: one(user, {
    fields: [subscriptions.referredByAgentId],
    references: [user.id],
    relationName: 'agent_referred_subscriptions',
  }),
  referredByMember: one(user, {
    fields: [subscriptions.referredByMemberId],
    references: [user.id],
    relationName: 'member_referred_subscriptions',
  }),
}));

export const membershipFamilyMembersRelations = relations(membershipFamilyMembers, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [membershipFamilyMembers.subscriptionId],
    references: [subscriptions.id],
  }),
  user: one(user, { fields: [membershipFamilyMembers.userId], references: [user.id] }),
}));

// CRM relations
export const crmLeadsRelations = relations(crmLeads, ({ one, many }) => ({
  agent: one(user, { fields: [crmLeads.agentId], references: [user.id] }),
  activities: many(crmActivities),
  deals: many(crmDeals),
}));

export const crmActivitiesRelations = relations(crmActivities, ({ one }) => ({
  lead: one(crmLeads, { fields: [crmActivities.leadId], references: [crmLeads.id] }),
  agent: one(user, { fields: [crmActivities.agentId], references: [user.id] }),
}));

export const crmDealsRelations = relations(crmDeals, ({ one }) => ({
  lead: one(crmLeads, { fields: [crmDeals.leadId], references: [crmLeads.id] }),
  agent: one(user, { fields: [crmDeals.agentId], references: [user.id] }),
  plan: one(membershipPlans, {
    fields: [crmDeals.membershipPlanId],
    references: [membershipPlans.id],
  }),
}));

// Referral and service relations
export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(user, {
    fields: [referrals.referrerId],
    references: [user.id],
    relationName: 'referrer',
  }),
  referred: one(user, {
    fields: [referrals.referredId],
    references: [user.id],
    relationName: 'referred',
  }),
}));

export const serviceUsageRelations = relations(serviceUsage, ({ one }) => ({
  user: one(user, { fields: [serviceUsage.userId], references: [user.id] }),
  subscription: one(subscriptions, {
    fields: [serviceUsage.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const serviceRequestsRelations = relations(serviceRequests, ({ one }) => ({
  user: one(user, { fields: [serviceRequests.userId], references: [user.id] }),
  subscription: one(subscriptions, {
    fields: [serviceRequests.subscriptionId],
    references: [subscriptions.id],
  }),
  handledBy: one(user, {
    fields: [serviceRequests.handledById],
    references: [user.id],
    relationName: 'service_request_handler',
  }),
}));

export const partnerDiscountUsageRelations = relations(partnerDiscountUsage, ({ one }) => ({
  user: one(user, { fields: [partnerDiscountUsage.userId], references: [user.id] }),
}));

// Agent relations
export const agentClientsRelations = relations(agentClients, ({ one }) => ({
  agent: one(user, {
    fields: [agentClients.agentId],
    references: [user.id],
    relationName: 'agent_clients_agent',
  }),
  member: one(user, {
    fields: [agentClients.memberId],
    references: [user.id],
    relationName: 'agent_clients_member',
  }),
}));

export const agentCommissionsRelations = relations(agentCommissions, ({ one }) => ({
  agent: one(user, { fields: [agentCommissions.agentId], references: [user.id] }),
  member: one(user, { fields: [agentCommissions.memberId], references: [user.id] }),
  subscription: one(subscriptions, {
    fields: [agentCommissions.subscriptionId],
    references: [subscriptions.id],
  }),
}));

// Member notes relations
export const memberNotesRelations = relations(memberNotes, ({ one }) => ({
  member: one(user, {
    fields: [memberNotes.memberId],
    references: [user.id],
    relationName: 'member_notes_member',
  }),
  author: one(user, {
    fields: [memberNotes.authorId],
    references: [user.id],
    relationName: 'member_notes_author',
  }),
}));

export const memberActivitiesRelations = relations(memberActivities, ({ one }) => ({
  agent: one(user, {
    fields: [memberActivities.agentId],
    references: [user.id],
    relationName: 'agent_member_activities',
  }),
  member: one(user, {
    fields: [memberActivities.memberId],
    references: [user.id],
    relationName: 'member_activity_history',
  }),
}));

// Phase 5: Notifications relations
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(user, { fields: [notifications.userId], references: [user.id] }),
}));

export const emailCampaignLogsRelations = relations(emailCampaignLogs, ({ one }) => ({
  user: one(user, { fields: [emailCampaignLogs.userId], references: [user.id] }),
}));
