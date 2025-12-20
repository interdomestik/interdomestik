import { relations } from 'drizzle-orm';
import {
  boolean,
  decimal,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Based on technical description: Submission -> Verification -> Evaluation -> Negotiation -> Court -> Final
export const statusEnum = pgEnum('status', [
  'draft',
  'submitted', // Phase 1: Submission
  'verification', // Phase 2: Information Verification
  'evaluation', // Phase 3: Damages Evaluation
  'negotiation', // Phase 4: Offer & Negotiation
  'court', // Phase 5: Judicial Process (if needed)
  'resolved', // Phase 6: Final Resolution (Success)
  'rejected', // Phase 6: Final Resolution (Failure)
]);

export const documentCategoryEnum = pgEnum('document_category', [
  'evidence',
  'correspondence',
  'contract',
  'receipt',
  'other',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'paused',
  'canceled',
  'trialing',
  'expired',
]);

export const membershipTierEnum = pgEnum('membership_tier', [
  'basic',
  'standard',
  'family',
  'business',
]);

export const commissionStatusEnum = pgEnum('commission_status', [
  'pending',
  'approved',
  'paid',
  'void',
]);

export const commissionTypeEnum = pgEnum('commission_type', [
  'new_membership',
  'renewal',
  'upgrade',
  'b2b',
]);

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull(),
  image: text('image'),
  role: text('role').notNull().default('user'),
  marketingOptIn: boolean('marketing_opt_in').default(false),
  referralCode: text('referral_code').unique(),
  consentAt: timestamp('consent_at'),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
  agentId: text('agentId'), // Sales agent who referred this member (legacy mapping)
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt'),
  updatedAt: timestamp('updatedAt'),
});

export const claims = pgTable('claim', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
  agentId: text('agentId').references(() => user.id), // Deprecated: use staffId for claim handling
  staffId: text('staffId').references(() => user.id),
  assignedAt: timestamp('assignedAt'),
  assignedById: text('assignedById').references(() => user.id),
  title: text('title').notNull(),
  description: text('description'),
  status: statusEnum('status').default('draft'),
  category: text('category').notNull(), // e.g. 'retail', 'services'
  companyName: text('companyName').notNull(),
  claimAmount: decimal('amount', { precision: 10, scale: 2 }),
  currency: text('currency').default('EUR'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').$onUpdate(() => new Date()),
});

export const claimDocuments = pgTable('claim_documents', {
  id: text('id').primaryKey(),
  claimId: text('claim_id')
    .notNull()
    .references(() => claims.id),
  name: text('name').notNull(),
  filePath: text('file_path').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  bucket: text('bucket').notNull().default('claim-evidence'),
  classification: text('classification').notNull().default('pii'),
  category: documentCategoryEnum('category').default('evidence').notNull(),
  uploadedBy: text('uploaded_by')
    .notNull()
    .references(() => user.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const claimMessages = pgTable('claim_messages', {
  id: text('id').primaryKey(),
  claimId: text('claim_id')
    .notNull()
    .references(() => claims.id),
  senderId: text('sender_id')
    .notNull()
    .references(() => user.id),
  content: text('content').notNull(),
  isInternal: boolean('is_internal').default(false), // Agent-only internal notes
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const claimStageHistory = pgTable('claim_stage_history', {
  id: text('id').primaryKey(),
  claimId: text('claim_id')
    .notNull()
    .references(() => claims.id),
  fromStatus: statusEnum('from_status'),
  toStatus: statusEnum('to_status').notNull(),
  changedById: text('changed_by_id').references(() => user.id),
  changedByRole: text('changed_by_role'),
  note: text('note'),
  isPublic: boolean('is_public').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').references(() => user.id),
  actorRole: text('actor_role'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

export const leads = pgTable('leads', {
  id: text('id').primaryKey(), // We'll use nanoid/uuid in the action or db default
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  category: text('category').notNull(),
  status: text('status').default('new'), // new, contacted, converted, closed
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').$onUpdate(() => new Date()),
});

export const crmLeads = pgTable('crm_leads', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => user.id),
  type: text('type').notNull(), // 'individual', 'business'
  fullName: text('full_name'),
  companyName: text('company_name'),
  phone: text('phone'),
  email: text('email'),
  source: text('source'),
  stage: text('stage').notNull(), // 'new', 'contacted', 'qualified', 'proposal', 'won', 'lost'
  score: integer('score').default(0),
  notes: text('notes'),
  lastContactedAt: timestamp('last_contacted_at'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmContent: text('utm_content'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
});

export const crmActivities = pgTable('crm_activities', {
  id: text('id').primaryKey(),
  leadId: text('lead_id')
    .notNull()
    .references(() => crmLeads.id),
  agentId: text('agent_id')
    .notNull()
    .references(() => user.id),
  type: text('type').notNull(), // 'call', 'meeting', 'email', 'note'
  summary: text('summary').notNull(),
  scheduledAt: timestamp('scheduled_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const crmDeals = pgTable('crm_deals', {
  id: text('id').primaryKey(),
  leadId: text('lead_id')
    .notNull()
    .references(() => crmLeads.id),
  agentId: text('agent_id')
    .notNull()
    .references(() => user.id),
  membershipPlanId: text('membership_plan_id').references(() => membershipPlans.id),
  valueCents: integer('value_cents').default(0),
  stage: text('stage').notNull(), // 'proposal', 'negotiation', 'closed_won', 'closed_lost'
  status: text('status').default('open'),
  closedAt: timestamp('closed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
});

export const membershipPlans = pgTable('membership_plans', {
  id: text('id').primaryKey(), // standard, family
  name: text('name').notNull(),
  description: text('description'),
  tier: membershipTierEnum('tier').notNull(),
  interval: text('interval').default('year').notNull(),
  price: decimal('price', { precision: 8, scale: 2 }).notNull(),
  currency: text('currency').default('EUR').notNull(),
  membersIncluded: integer('members_included').default(1).notNull(),
  legalConsultationsPerYear: integer('legal_consultations_per_year'),
  mediationDiscountPercent: integer('mediation_discount_percent').default(0).notNull(),
  successFeePercent: integer('success_fee_percent').default(15).notNull(),
  paddlePriceId: text('paddle_price_id'),
  paddleProductId: text('paddle_product_id'),
  features: jsonb('features').$type<string[]>().notNull().default([]),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull(),
});

export const userNotificationPreferences = pgTable('user_notification_preferences', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Email notifications
  emailClaimUpdates: boolean('email_claim_updates').default(true).notNull(),
  emailMarketing: boolean('email_marketing').default(false).notNull(),
  emailNewsletter: boolean('email_newsletter').default(true).notNull(),
  // Push notifications
  pushClaimUpdates: boolean('push_claim_updates').default(true).notNull(),
  pushMessages: boolean('push_messages').default(true).notNull(),
  // In-app notifications
  inAppAll: boolean('in_app_all').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(), // Paddle Subscription ID
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  planId: text('plan_id').notNull(), // Paddle Price ID
  planKey: text('plan_key').references(() => membershipPlans.id),
  provider: text('provider').default('paddle'),
  providerCustomerId: text('provider_customer_id'),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  canceledAt: timestamp('canceled_at'),
  pastDueAt: timestamp('past_due_at'),
  gracePeriodEndsAt: timestamp('grace_period_ends_at'),
  dunningAttemptCount: integer('dunning_attempt_count').default(0),
  lastDunningAt: timestamp('last_dunning_at'),
  referredByAgentId: text('referred_by_agent_id').references(() => user.id),
  referredByMemberId: text('referred_by_member_id').references(() => user.id),
  referralCode: text('referral_code').unique(),
  acquisitionSource: text('acquisition_source'), // 'agent', 'referral', 'organic', 'partner'
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmContent: text('utm_content'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
});

export const membershipFamilyMembers = pgTable('membership_family_members', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id')
    .notNull()
    .references(() => subscriptions.id),
  userId: text('user_id').references(() => user.id), // Optional, if they have an account
  name: text('name').notNull(),
  relationship: text('relationship'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentClients = pgTable('agent_clients', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => user.id),
  memberId: text('member_id')
    .notNull()
    .references(() => user.id),
  status: text('status').default('active').notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const agentCommissions = pgTable('agent_commissions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => user.id),
  memberId: text('member_id').references(() => user.id),
  subscriptionId: text('subscription_id').references(() => subscriptions.id),
  type: commissionTypeEnum('type').notNull(),
  status: commissionStatusEnum('status').default('pending').notNull(),
  amount: decimal('amount', { precision: 8, scale: 2 }).notNull(),
  currency: text('currency').default('EUR').notNull(),
  earnedAt: timestamp('earned_at').defaultNow(),
  paidAt: timestamp('paid_at'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
});

export const referrals = pgTable('referrals', {
  id: text('id').primaryKey(),
  referrerId: text('referrer_id')
    .notNull()
    .references(() => user.id),
  referredId: text('referred_id')
    .notNull()
    .references(() => user.id),
  referralCode: text('referral_code').notNull(),
  status: text('status').default('pending'), // 'pending', 'converted', 'paid'
  referrerRewardCents: integer('referrer_reward_cents'),
  referredRewardCents: integer('referred_reward_cents'),
  rewardedAt: timestamp('rewarded_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const serviceUsage = pgTable('service_usage', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  subscriptionId: text('subscription_id')
    .notNull()
    .references(() => subscriptions.id),
  serviceCode: text('service_code').notNull(), // 'legal_consult', 'injury_cat', 'hotline'
  usedAt: timestamp('used_at').defaultNow(),
});

export const serviceRequests = pgTable('service_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  subscriptionId: text('subscription_id').references(() => subscriptions.id),
  serviceCode: text('service_code').notNull(),
  status: text('status').default('open'), // 'open', 'in_progress', 'closed'
  handledById: text('handled_by_id').references(() => user.id),
  requestedAt: timestamp('requested_at').defaultNow(),
  closedAt: timestamp('closed_at'),
  notes: text('notes'),
});

export const partnerDiscountUsage = pgTable('partner_discount_usage', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  partnerName: text('partner_name').notNull(),
  estimatedSavingsCents: integer('estimated_savings_cents'),
  usedAt: timestamp('used_at').defaultNow(),
});

export const leadDownloads = pgTable('lead_downloads', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  resourceCode: text('resource_code').notNull(),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  marketingOptIn: boolean('marketing_opt_in').default(false),
  convertedToMember: boolean('converted_to_member').default(false),
  downloadedAt: timestamp('downloaded_at').defaultNow(),
});

export const userRelations = relations(user, ({ many, one }) => ({
  claims: many(claims),
  staffClaims: many(claims, { relationName: 'claim_staff' }),
  auditLogs: many(auditLog),
  subscriptions: many(subscriptions),
  agentClients: many(agentClients, { relationName: 'agent_clients_agent' }),
  memberAgents: many(agentClients, { relationName: 'agent_clients_member' }),
  commissions: many(agentCommissions),
  agent: one(user, {
    fields: [user.agentId],
    references: [user.id],
    relationName: 'user_agent',
  }),
  clients: many(user, {
    relationName: 'user_agent',
  }),
  crmLeads: many(crmLeads),
  crmActivities: many(crmActivities),
  crmDeals: many(crmDeals),
  referralsSent: many(referrals, { relationName: 'referrer' }),
  referralsReceived: many(referrals, { relationName: 'referred' }),
  serviceUsage: many(serviceUsage),
  serviceRequests: many(serviceRequests),
  handledServiceRequests: many(serviceRequests, { relationName: 'service_request_handler' }),
  partnerDiscountUsage: many(partnerDiscountUsage),
}));

export const claimsRelations = relations(claims, ({ one, many }) => ({
  user: one(user, {
    fields: [claims.userId],
    references: [user.id],
  }),
  staff: one(user, {
    fields: [claims.staffId],
    references: [user.id],
    relationName: 'claim_staff',
  }),
  documents: many(claimDocuments),
  messages: many(claimMessages),
  stageHistory: many(claimStageHistory),
}));

export const claimDocumentsRelations = relations(claimDocuments, ({ one }) => ({
  claim: one(claims, {
    fields: [claimDocuments.claimId],
    references: [claims.id],
  }),
}));

export const claimMessagesRelations = relations(claimMessages, ({ one }) => ({
  claim: one(claims, {
    fields: [claimMessages.claimId],
    references: [claims.id],
  }),
  sender: one(user, {
    fields: [claimMessages.senderId],
    references: [user.id],
  }),
}));

export const claimStageHistoryRelations = relations(claimStageHistory, ({ one }) => ({
  claim: one(claims, {
    fields: [claimStageHistory.claimId],
    references: [claims.id],
  }),
  changedBy: one(user, {
    fields: [claimStageHistory.changedById],
    references: [user.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, {
    fields: [auditLog.actorId],
    references: [user.id],
  }),
}));

export const membershipPlansRelations = relations(membershipPlans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(user, {
    fields: [subscriptions.userId],
    references: [user.id],
  }),
  plan: one(membershipPlans, {
    fields: [subscriptions.planKey],
    references: [membershipPlans.id],
  }),
  familyMembers: many(membershipFamilyMembers),
  referredByAgent: one(user, {
    fields: [subscriptions.referredByAgentId],
    references: [user.id],
  }),
  referredByMember: one(user, {
    fields: [subscriptions.referredByMemberId],
    references: [user.id],
  }),
}));

export const membershipFamilyMembersRelations = relations(membershipFamilyMembers, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [membershipFamilyMembers.subscriptionId],
    references: [subscriptions.id],
  }),
  user: one(user, {
    fields: [membershipFamilyMembers.userId],
    references: [user.id],
  }),
}));

export const crmLeadsRelations = relations(crmLeads, ({ one, many }) => ({
  agent: one(user, {
    fields: [crmLeads.agentId],
    references: [user.id],
  }),
  activities: many(crmActivities),
  deals: many(crmDeals),
}));

export const crmActivitiesRelations = relations(crmActivities, ({ one }) => ({
  lead: one(crmLeads, {
    fields: [crmActivities.leadId],
    references: [crmLeads.id],
  }),
  agent: one(user, {
    fields: [crmActivities.agentId],
    references: [user.id],
  }),
}));

export const crmDealsRelations = relations(crmDeals, ({ one }) => ({
  lead: one(crmLeads, {
    fields: [crmDeals.leadId],
    references: [crmLeads.id],
  }),
  agent: one(user, {
    fields: [crmDeals.agentId],
    references: [user.id],
  }),
  plan: one(membershipPlans, {
    fields: [crmDeals.membershipPlanId],
    references: [membershipPlans.id],
  }),
}));

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
  user: one(user, {
    fields: [serviceUsage.userId],
    references: [user.id],
  }),
  subscription: one(subscriptions, {
    fields: [serviceUsage.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const serviceRequestsRelations = relations(serviceRequests, ({ one }) => ({
  user: one(user, {
    fields: [serviceRequests.userId],
    references: [user.id],
  }),
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
  user: one(user, {
    fields: [partnerDiscountUsage.userId],
    references: [user.id],
  }),
}));

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
  agent: one(user, {
    fields: [agentCommissions.agentId],
    references: [user.id],
  }),
  member: one(user, {
    fields: [agentCommissions.memberId],
    references: [user.id],
  }),
  subscription: one(subscriptions, {
    fields: [agentCommissions.subscriptionId],
    references: [subscriptions.id],
  }),
}));
