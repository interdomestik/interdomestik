// Private finite source clauses. These are executable-shape premises, not admission policy.
export const VERIFIER_CONTRACT = String.raw`
import * as schema from '@interdomestik/database/schema';
import { ensureAccessTenantId } from '@interdomestik/shared-auth/session';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { userSchemaConfig } from './user-schema';
function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}
export function createCurrentStoreSessionVerifier(configuration) {
  const issuer = new URL(configuration.issuerBaseURL);
  if (!['http:', 'https:'].includes(issuer.protocol) || issuer.username || issuer.password || issuer.search || issuer.hash || typeof configuration.issuerSecret !== 'string' || configuration.issuerSecret.length < 32) {
    throw new Error('Invalid private identity verifier configuration');
  }
  const authority = betterAuth({
    baseURL: configuration.issuerBaseURL,
    secret: configuration.issuerSecret,
    database: drizzleAdapter(configuration.database, {provider:'pg',schema:{user:schema.user,session:schema.session}}),
    user: userSchemaConfig,
    session: {cookieCache:{enabled:false}},
    rateLimit:{enabled:false},
    logger:{disabled:true},
  });
  return async function verify(cookie) {
    if (typeof cookie !== 'string' || cookie.length === 0 || cookie.length > 8192 || /[\r\n\u0000]/.test(cookie)) { return null; }
    try {
      const current = await authority.api.getSession({headers:new Headers({cookie}),query:{disableCookieCache:true,disableRefresh:true}});
      if (!current) return null;
      const actor = current.user;
      const tenantId = actor.tenantId;
      const accessTenantId = ensureAccessTenantId(current);
      if (!identifier(actor.id) || !identifier(actor.role) || !identifier(tenantId) || !identifier(accessTenantId) || !identifier(current.session.id) || current.session.userId !== actor.id || (actor.branchId != null && !identifier(actor.branchId))) { return null; }
      return Object.freeze({actorId:actor.id,actorRole:actor.role,tenantId,accessTenantId,branchId:actor.branchId ?? null,sessionId:current.session.id});
    } catch { return null; }
  };
}
`;
export const USER_SCHEMA_CONTRACT = `
import type { BetterAuthOptions } from 'better-auth';
export const userSchemaConfig = {
  additionalFields: {
    tenantId: {type:'string',fieldName:'tenantId',input:false},
    branchId: {type:'string',fieldName:'branchId',input:false},
    role: {type:'string',defaultValue:'member',input:false},
    memberNumber: {type:'string',fieldName:'memberNumber',input:false},
    tenantClassificationPending: {type:'boolean',fieldName:'tenantClassificationPending',defaultValue:false,input:false},
    agentId: {type:'string',fieldName:'agentId',input:false},
    referralCode: {type:'string',fieldName:'referralCode',input:false},
  },
} satisfies BetterAuthOptions['user'];
`;
export const SESSION_CONTRACT = `
import { MissingTenantError, UnauthorizedError } from './errors';
export function ensureTenantId(session) { return ensureAccessTenantId(session); }
export function ensureAccessTenantId(session) {
  if (!session) { throw new UnauthorizedError(); }
  if (!session.user) { throw new UnauthorizedError('Unauthorized: No user in session'); }
  const accessTenantId = session.user.accessTenantId?.trim() || session.user.tenantId?.trim();
  if (!accessTenantId) { throw new MissingTenantError(); }
  return accessTenantId;
}
`;
export const SESSION_RESOLVER_CONTRACT = Object.freeze({
  name: '@interdomestik/shared-auth',
  version: '1.0.0',
  private: true,
  main: './src/index.ts',
  types: './src/index.ts',
  exports: Object.freeze({
    '.': './src/index.ts',
    './errors': './src/errors.ts',
    './session': './src/session.ts',
  }),
  scripts: Object.freeze({
    'type-check': 'tsc --noEmit',
    'test:unit': 'vitest run',
    test: 'vitest run',
  }),
  devDependencies: Object.freeze({ '@vitest/coverage-v8': '^4.1.11', vitest: '^4.1.11' }),
});
