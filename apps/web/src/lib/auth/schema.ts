import { dbAdmin } from '@interdomestik/database/db';
import * as schema from '@interdomestik/database/schema';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export { userSchemaConfig } from './user-schema';

export const databaseAdapter = drizzleAdapter(dbAdmin, {
  provider: 'pg',
  schema: {
    user: schema.user,
    session: schema.session,
    account: schema.account,
    verification: schema.verification,
  },
});
