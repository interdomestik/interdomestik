import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  tablesFilter: [
    'user',
    'session',
    'account',
    'verification',
    'claim',
    'claim_documents',
    'claim_messages',
    'claim_stage_history',
    'audit_log',
    'leads',
    'membership_plans',
    'user_notification_preferences',
    'subscriptions',
    'agent_clients',
    'agent_commissions',
    'automation_logs',
  ],
});
