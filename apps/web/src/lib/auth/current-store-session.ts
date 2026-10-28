import * as schema from '@interdomestik/database/schema';
import { ensureAccessTenantId } from '@interdomestik/shared-auth/session';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { userSchemaConfig } from './user-schema';

export type CurrentOperationPrincipal = Readonly<{
  actorId: string;
  actorRole: string;
  tenantId: string;
  accessTenantId: string;
  branchId: string | null;
  sessionId: string;
}>;

type VerifierConfiguration = {
  database: PostgresJsDatabase<typeof schema>;
  issuerBaseURL: string;
  issuerSecret: string;
};

function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

// Private backend construction: use its qualified identity-purpose pool and the original
// issuer configuration. This factory does not expose sign-in, arbitrary API calls or a handler.
// The standalone verifier is not itself a qualification of its supplied pool/deployment.
export function createCurrentStoreSessionVerifier(configuration: VerifierConfiguration) {
  const issuer = new URL(configuration.issuerBaseURL);
  if (
    !['http:', 'https:'].includes(issuer.protocol) ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash ||
    typeof configuration.issuerSecret !== 'string' ||
    configuration.issuerSecret.length < 32
  ) {
    throw new Error('Invalid private identity verifier configuration');
  }

  const authority = betterAuth({
    // Cookie prefix/security follows the actual issuer, never the backend listener URL.
    baseURL: configuration.issuerBaseURL,
    secret: configuration.issuerSecret,
    database: drizzleAdapter(configuration.database, {
      provider: 'pg',
      schema: { user: schema.user, session: schema.session },
    }),
    user: userSchemaConfig,
    session: { cookieCache: { enabled: false } },
    rateLimit: { enabled: false },
    // The boundary returns an admission denial; vendor SQL errors may contain token parameters.
    logger: { disabled: true },
  });

  return async function verify(cookie: unknown): Promise<CurrentOperationPrincipal | null> {
    if (
      typeof cookie !== 'string' ||
      cookie.length === 0 ||
      cookie.length > 8192 ||
      /[\r\n\u0000]/.test(cookie)
    ) {
      return null;
    }
    try {
      // Do not forward caller-selected host, tenant, identity or cache controls.
      const current = await authority.api.getSession({
        headers: new Headers({ cookie }),
        query: { disableCookieCache: true, disableRefresh: true },
      });
      if (!current) return null;
      const actor = current.user;
      const tenantId = actor.tenantId;
      const accessTenantId = ensureAccessTenantId(current);
      if (
        !identifier(actor.id) ||
        !identifier(actor.role) ||
        !identifier(tenantId) ||
        !identifier(accessTenantId) ||
        !identifier(current.session.id) ||
        current.session.userId !== actor.id ||
        (actor.branchId != null && !identifier(actor.branchId))
      ) {
        return null;
      }
      return Object.freeze({
        actorId: actor.id,
        actorRole: actor.role,
        tenantId,
        accessTenantId,
        branchId: actor.branchId ?? null,
        sessionId: current.session.id,
      });
    } catch {
      // Store failures and expired-session cleanup failures both deny admission.
      return null;
    }
  };
}
