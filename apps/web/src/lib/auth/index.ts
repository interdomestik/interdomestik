import { betterAuth } from 'better-auth';
import { authConfig } from './config';
import { authRequestAuthority } from './auth-request-authority';
import { databaseHooks } from './hooks';
import { authProviders } from './providers';
import { databaseAdapter, userSchemaConfig } from './schema';

export const auth = betterAuth({
  ...authConfig,
  database: databaseAdapter,
  databaseHooks,
  hooks: { before: authRequestAuthority },
  user: userSchemaConfig,
  ...authProviders,
});
