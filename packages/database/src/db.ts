import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
import {
  CONFIGURATION,
  createQueryClient,
  isLocalDatabaseUrl,
  isProduction,
} from './database-connection';

import { assertDatabaseConfigurationUnchanged } from './database-configuration';

import { queryRlsRolePosture } from './rls-role-posture-query';
import { createRlsRoleReadiness, type RlsRoleReadinessSnapshot } from './rls-role-readiness';
import * as schema from './schema';

export type { RlsRoleReadinessSnapshot } from './rls-role-readiness';

// Refuse split import-time profiles before any client is acquired.
assertDatabaseConfigurationUnchanged();

// The same provider owns this role, dbRls and its readiness assertion.
export function captureConfiguredRlsRole(): string | null {
  assertDatabaseConfigurationUnchanged();
  return CONFIGURATION.DB_RLS_ROLE?.trim() || null;
}

const globalQueryClients = global as unknown as {
  queryClientAdmin?: postgres.Sql;
  queryClientRls?: postgres.Sql;
};

if (!CONFIGURATION.DATABASE_URL) {
  console.error('❌ DATABASE_URL is missing in db.ts!');
}

// Production URLs name one explicit principal: canonical IPv4 or a DNS name, never PG* fallbacks.
const PRODUCTION_DATABASE_URL =
  /^postgres(?:ql)?:\/\/([^:@/?#[\]\\]+):[^:@/?#[\]\\]+@([\w.-]+):([1-9]\d{0,4})\/(\w[\w.-]*)(?:\?([^#]+))?$/u;
const PRODUCTION_HOST =
  /^(?:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)|(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)*[a-z](?:[a-z\d-]*[a-z\d])?)$/iu;
const PRODUCTION_QUERY_PAIR = /^(?:sslmode|application_name)=[^&=]*$/u;

function productionDatabasePrincipal(databaseUrl: unknown, name: string): string {
  const match =
    typeof databaseUrl === 'string' && /^[\x21-\x7e]+$/u.test(databaseUrl)
      ? PRODUCTION_DATABASE_URL.exec(databaseUrl)
      : null;
  try {
    if (match) {
      const [url, user = '', host = '', port = '', database = '', query] = match;
      const parsed = new URL(url);
      const decodedUser = decodeURIComponent(user);
      const pairs = query ? query.split('&') : [];
      const sslmode = parsed.searchParams.get('sslmode');
      const decodedUrl = decodeURIComponent(url);
      // postgres.js connects with these WHATWG components, so each must equal the validated text.
      if (
        !/[\x00-\x1f\x7f]/u.test(decodedUrl) &&
        decodeURIComponent(parsed.username) === decodedUser &&
        parsed.hostname === host &&
        parsed.port === port &&
        parsed.pathname === `/${database}` &&
        Number(port) <= 65_535 &&
        PRODUCTION_HOST.test(host) &&
        pairs.every(pair => PRODUCTION_QUERY_PAIR.test(pair)) &&
        new Set(pairs.map(pair => pair.split('=')[0])).size === pairs.length &&
        (sslmode === null || sslmode === (isLocalDatabaseUrl(url) ? 'disable' : 'require'))
      ) {
        return JSON.stringify([decodedUser, host.toLowerCase(), Number(port), database]);
      }
    }
  } catch {
    // Generic refusal below: never surface the URL, credentials or parser cause.
  }
  throw new Error(`${name} does not match the production connection profile; refusing startup`);
}

type QueryClients = { admin: postgres.Sql; rls: postgres.Sql };

function createProductionQueryClients(adminUrl: string, rlsUrl: string): QueryClients {
  // Presence only: never read, adopt, delete or end a legacy client this module did not construct.
  if ('queryClientAdmin' in globalQueryClients || 'queryClientRls' in globalQueryClients) {
    throw new Error('Production refuses preexisting global database clients; refusing startup');
  }
  const adminPrincipal = productionDatabasePrincipal(adminUrl, 'DATABASE_URL');
  if (adminPrincipal === productionDatabasePrincipal(rlsUrl, 'DATABASE_URL_RLS')) {
    throw new Error(
      'DATABASE_URL_RLS uses the DATABASE_URL principal; configure a separate NOBYPASSRLS role for tenant-scoped queries.'
    );
  }
  // Private handles: production never writes legacy globals, so later writes cannot redirect them.
  return {
    admin: createQueryClient(adminUrl, 'admin'),
    rls: createQueryClient(rlsUrl, 'rls'),
  };
}

function reuseGlobalQueryClients(adminUrl: string, rlsUrl: string): QueryClients {
  const admin = globalQueryClients.queryClientAdmin ?? createQueryClient(adminUrl, 'admin');
  const rls =
    globalQueryClients.queryClientRls ??
    (rlsUrl === adminUrl ? admin : createQueryClient(rlsUrl, 'rls'));
  globalQueryClients.queryClientAdmin = admin;
  globalQueryClients.queryClientRls = rls;
  return { admin, rls };
}

const adminDatabaseUrl = CONFIGURATION.DATABASE_URL!;

const rlsDatabaseUrl = isProduction
  ? CONFIGURATION.DATABASE_URL_RLS!
  : (CONFIGURATION.DATABASE_URL_RLS ?? adminDatabaseUrl);
// Production (including loopback) awaits actual RLS role readiness; nonproduction keeps HMR reuse.
const shouldAssertRlsConnectionRole = isProduction || CONFIGURATION.REQUIRE_RLS_INTEGRATION === '1';

// A controlled test launcher binds configuration before the first product import.
// This conflict check is not a permission token or proof of process isolation.
const expectedProcessProfile = CONFIGURATION.INTERDOMESTIK_DB_PROFILE_SHA256;
if (expectedProcessProfile !== undefined) {
  const capturedProfile = [
    CONFIGURATION.NODE_ENV,
    CONFIGURATION.VERCEL,
    CONFIGURATION.DATABASE_URL,
    CONFIGURATION.DATABASE_URL_RLS,
    CONFIGURATION.DB_RLS_ROLE,
    CONFIGURATION.REQUIRE_RLS_INTEGRATION,
    CONFIGURATION.DB_MAX_CONNECTIONS,
    CONFIGURATION.DB_CONNECT_TIMEOUT,
    CONFIGURATION.DB_IDLE_TIMEOUT,
    CONFIGURATION.DB_MAX_LIFETIME,
  ].map(value => value ?? null);
  const actualProfile = createHash('sha256').update(JSON.stringify(capturedProfile)).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(expectedProcessProfile) || actualProfile !== expectedProcessProfile) {
    throw new Error('Database process profile changed before initialization; refusing startup.');
  }
}

const { admin: adminQueryClient, rls: rlsQueryClient } = isProduction
  ? createProductionQueryClients(adminDatabaseUrl, rlsDatabaseUrl)
  : reuseGlobalQueryClients(adminDatabaseUrl, rlsDatabaseUrl);

// Cache successful posture, but allow a later request to recover from a settled timeout.
const rlsRoleReadiness = createRlsRoleReadiness({
  enabled: shouldAssertRlsConnectionRole,
  initialFailure: null,
  configuredDbRole: CONFIGURATION.DB_RLS_ROLE,
  timeoutMs: 5_000,
  queryRolePosture: roleName => queryRlsRolePosture(rlsQueryClient, roleName),
});

function createAssertedRlsDatabaseClient<TClient extends object>(client: TClient): TClient {
  if (!shouldAssertRlsConnectionRole) {
    return client;
  }

  return new Proxy(client, {
    get(target, property, receiver) {
      rlsRoleReadiness.assertClientReady();
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export async function assertRlsConnectionRoleReady(): Promise<void> {
  await rlsRoleReadiness.assertReady();
}

export function getDatabaseReadinessSnapshot(): RlsRoleReadinessSnapshot {
  return rlsRoleReadiness.snapshot();
}

export const dbAdmin = drizzle(adminQueryClient, { schema });
const dbRlsClient = drizzle(rlsQueryClient, { schema });
export const dbRls = createAssertedRlsDatabaseClient(dbRlsClient);

/**
 * Backward-compatible alias. Prefer explicit dbRls or dbAdmin.
 */
export const db = dbRls;
