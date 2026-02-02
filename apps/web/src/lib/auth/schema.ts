import { db } from '@interdomestik/database/db';
import * as schema from '@interdomestik/database/schema';
import { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export const databaseAdapter = drizzleAdapter(db, {
  provider: 'pg',
  schema: {
    user: schema.user,
    session: schema.session,
    account: schema.account,
    verification: schema.verification,
  },
});

export const userSchemaConfig = {
  additionalFields: {
    tenantId: {
      type: 'string',
      fieldName: 'tenantId',
    },
    branchId: {
      type: 'string',
      fieldName: 'branchId', // Maps to Drizzle schema key 'branchId'
      // CRITICAL FOR RLS: This field scopes Branch Managers to their specific branch.
      // It MUST be checked in all protected actions to prevent cross-branch data leakage.
    },
    role: {
      type: 'string',
      defaultValue: 'user',
    },
    memberNumber: {
      type: 'string',
      fieldName: 'memberNumber',
    },
    agentId: {
      type: 'string',
      fieldName: 'agentId',
    },
    referralCode: {
      type: 'string',
      fieldName: 'referralCode',
    },
  },
} satisfies BetterAuthOptions['user'];
