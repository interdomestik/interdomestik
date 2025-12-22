import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';

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

// Forward reference - crmDeals needs membershipPlans which is in memberships.ts
// We'll import it in the index and use the reference there
export const crmDeals = pgTable('crm_deals', {
  id: text('id').primaryKey(),
  leadId: text('lead_id')
    .notNull()
    .references(() => crmLeads.id),
  agentId: text('agent_id')
    .notNull()
    .references(() => user.id),
  membershipPlanId: text('membership_plan_id'), // FK added via relations
  valueCents: integer('value_cents').default(0),
  stage: text('stage').notNull(), // 'proposal', 'negotiation', 'closed_won', 'closed_lost'
  status: text('status').default('open'),
  closedAt: timestamp('closed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
});

// Legacy leads table
export const leads = pgTable('leads', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  category: text('category').notNull(),
  status: text('status').default('new'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').$onUpdate(() => new Date()),
});
