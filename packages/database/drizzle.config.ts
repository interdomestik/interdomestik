import { defineConfig } from 'drizzle-kit';

function getSslConfig() {
  if (process.env.NODE_ENV === 'production') return 'require';
  if (process.env.NODE_ENV === 'staging') return 'prefer';
  return false;
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl: getSslConfig(),
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
  verbose: process.env.NODE_ENV === 'development',
  strict: true,
});
