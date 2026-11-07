import { betterAuth } from 'better-auth';
import { authConfig } from './config';
import { authRequestAuthority } from './auth-request-authority';
import { databaseHooks } from './hooks';
import { authProviders } from './providers';
import { resetCompletion } from './reset-completion';
import { databaseAdapter, userSchemaConfig } from './schema';

export const auth = betterAuth({
  ...authConfig,
  database: databaseAdapter,
  databaseHooks,
  hooks: { before: authRequestAuthority, after: resetCompletion },
  user: userSchemaConfig,
  ...authProviders,
});
