import { dbAdmin } from '@interdomestik/database/db';
import * as schema from '@interdomestik/database/schema';
import { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export const databaseAdapter = drizzleAdapter(dbAdmin, {
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
      input: false,
    },
    branchId: {
      type: 'string',
      fieldName: 'branchId', // Maps to Drizzle schema key 'branchId'
      input: false,
      // CRITICAL FOR RLS: This field scopes Branch Managers to their specific branch.
      // It MUST be checked in all protected actions to prevent cross-branch data leakage.
    },
    role: {
      type: 'string',
      defaultValue: 'member',
      input: false,
    },
    memberNumber: {
      type: 'string',
      fieldName: 'memberNumber',
      input: false,
    },
    tenantClassificationPending: {
      type: 'boolean',
      fieldName: 'tenantClassificationPending',
      defaultValue: false,
      input: false,
    },
    agentId: {
      type: 'string',
      fieldName: 'agentId',
      input: false,
    },
    referralCode: {
      type: 'string',
      fieldName: 'referralCode',
      input: false,
    },
  },
} satisfies BetterAuthOptions['user'];
