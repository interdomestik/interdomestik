import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  assertRlsConnectionRole,
  type RlsConnectionRoleAssertionResult,
  type RlsConnectionRolePosture,
} from './rls-role-assertion';
import * as schema from './schema';

const globalQueryClients = global as unknown as {
  queryClientAdmin?: postgres.Sql;
  queryClientRls?: postgres.Sql;
};

const isProduction = process.env.NODE_ENV === 'production';
const isVercelRuntime = process.env.VERCEL === '1';

function parseEnvInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is missing in db.ts!');
}

function createQueryClient(databaseUrl: string, label: 'admin' | 'rls'): postgres.Sql {
  const configuredMax = parseEnvInt(process.env.DB_MAX_CONNECTIONS, isProduction ? 5 : 10);
  const safeMax = isProduction && isVercelRuntime ? Math.min(configuredMax, 1) : configuredMax;

  return postgres(databaseUrl, {
    max: safeMax,
    ssl: isProduction && !isLocalDatabaseUrl(databaseUrl) ? 'require' : false,
    idle_timeout: parseEnvInt(process.env.DB_IDLE_TIMEOUT, isProduction ? 10 : 20),
    connect_timeout: parseEnvInt(process.env.DB_CONNECT_TIMEOUT, 10),
    max_lifetime: parseEnvInt(process.env.DB_MAX_LIFETIME, 1800),
    onnotice: notice => {
      if (isProduction) {
        console.warn(`[database:${label}] notice:`, notice);
      }
    },
  });
}

const adminDatabaseUrl = process.env.DATABASE_URL!;

if (isProduction && !process.env.DATABASE_URL_RLS) {
  throw new Error('DATABASE_URL_RLS is required in production; refusing admin database fallback');
}

const rlsDatabaseUrl = process.env.DATABASE_URL_RLS ?? adminDatabaseUrl;
const shouldRequireProductionRlsConnection = isProduction && !isLocalDatabaseUrl(rlsDatabaseUrl);
const shouldAssertRlsConnectionRole =
  shouldRequireProductionRlsConnection || process.env.REQUIRE_RLS_INTEGRATION === '1';
const rlsConnectionUrlFailure =
  shouldRequireProductionRlsConnection && rlsDatabaseUrl === adminDatabaseUrl
    ? new Error(
        'DATABASE_URL_RLS is identical to DATABASE_URL; configure a separate NOBYPASSRLS role for tenant-scoped queries.'
      )
    : null;

const adminQueryClient =
  globalQueryClients.queryClientAdmin ?? createQueryClient(adminDatabaseUrl, 'admin');
const rlsQueryClient =
  globalQueryClients.queryClientRls ??
  (rlsDatabaseUrl === adminDatabaseUrl
    ? adminQueryClient
    : createQueryClient(rlsDatabaseUrl, 'rls'));

globalQueryClients.queryClientAdmin = adminQueryClient;
globalQueryClients.queryClientRls = rlsQueryClient;

async function queryRlsConnectionRolePosture(
  roleName?: string
): Promise<RlsConnectionRolePosture[]> {
  if (roleName) {
    return rlsQueryClient<RlsConnectionRolePosture[]>`
      select
        current_user as "currentUser",
        rolname as "roleName",
        rolbypassrls as "roleBypassesRls",
        rolsuper as "roleIsSuperuser"
      from pg_roles
      where rolname = ${roleName}
      limit 1
    `;
  }

  return rlsQueryClient<RlsConnectionRolePosture[]>`
      select
        current_user as "currentUser",
        rolname as "roleName",
        rolbypassrls as "roleBypassesRls",
        rolsuper as "roleIsSuperuser"
      from pg_roles
      where rolname = current_user
      limit 1
    `;
}

type RlsConnectionRoleAssertionState = 'not_required' | 'pending' | 'passed' | 'failed';

function getInitialRlsConnectionRoleAssertionState(): RlsConnectionRoleAssertionState {
  if (shouldAssertRlsConnectionRole && rlsConnectionUrlFailure) {
    return 'failed';
  }

  if (shouldAssertRlsConnectionRole) {
    return 'pending';
  }

  return 'not_required';
}

let rlsConnectionRoleAssertionState: RlsConnectionRoleAssertionState =
  getInitialRlsConnectionRoleAssertionState();
let rlsConnectionRoleAssertionFailure: unknown = rlsConnectionUrlFailure;

type OptionalSentry = {
  addBreadcrumb?: (breadcrumb: {
    category?: string;
    level?: 'info' | 'error';
    message?: string;
    data?: Record<string, unknown>;
  }) => void;
  captureException?: (error: unknown, options?: Record<string, unknown>) => void;
  captureMessage?: (message: string, options?: Record<string, unknown>) => void;
};

let rlsConnectionRoleAssertionTelemetryReported = false;

async function loadOptionalSentry(): Promise<OptionalSentry | null> {
  try {
    const importOptionalModule = new Function('specifier', 'return import(specifier)') as (
      specifier: string
    ) => Promise<unknown>;
    return (await importOptionalModule('@sentry/nextjs')) as OptionalSentry;
  } catch {
    return null;
  }
}

function reportRlsConnectionRoleAssertion(
  result: RlsConnectionRoleAssertionResult,
  error?: unknown
): void {
  if (rlsConnectionRoleAssertionTelemetryReported) {
    return;
  }
  rlsConnectionRoleAssertionTelemetryReported = true;

  const event = `database.rls.role_assertion.${result.ok ? 'passed' : 'failed'}`;
  const data = {
    currentUser: result.currentUser,
    configuredDbRole: result.configuredDbRole,
    reason: result.ok ? undefined : result.reason,
    checkedRole: result.ok ? undefined : result.checkedRole,
  };

  if (result.ok) {
    console.info(`[database:rls] ${event}`, data);
  } else {
    console.error(`[database:rls] ${event}`, error ?? data);
  }

  void loadOptionalSentry()
    .then(sentry => {
      if (!sentry) {
        return;
      }

      try {
        sentry.addBreadcrumb?.({
          category: 'database.rls',
          level: result.ok ? 'info' : 'error',
          message: event,
          data,
        });

        if (result.ok) {
          sentry.captureMessage?.(event, {
            level: 'info',
            tags: {
              component: 'database',
              check: 'rls_role_assertion',
            },
            extra: data,
          });
          return;
        }

        sentry.captureException?.(error, {
          fingerprint: ['database.rls.role_assertion.failed'],
          tags: {
            component: 'database',
            check: 'rls_role_assertion',
          },
          extra: data,
        });
      } catch (telemetryError) {
        if (isProduction) {
          console.warn('[database:rls] optional Sentry telemetry failed:', telemetryError);
        }
      }
    })
    .catch(telemetryError => {
      if (isProduction) {
        console.warn('[database:rls] optional Sentry telemetry failed:', telemetryError);
      }
    });
}

function resultFromRlsConnectionRoleAssertionError(
  error: unknown
): RlsConnectionRoleAssertionResult {
  if (error instanceof Error && 'result' in error) {
    return error.result as RlsConnectionRoleAssertionResult;
  }

  return {
    ok: false,
    reason: 'query_failed',
    cause: error,
  };
}

// One pg_roles check per process/isolate cold start, plus one more when DB_RLS_ROLE is set.
// withTenantContext awaits the same module-scoped promise; this is not a per-request query.
function startRlsConnectionRoleAssertion(): Promise<RlsConnectionRoleAssertionResult | undefined> {
  if (!shouldAssertRlsConnectionRole) {
    return Promise.resolve(undefined);
  }

  if (rlsConnectionUrlFailure) {
    reportRlsConnectionRoleAssertion(
      {
        ok: false,
        reason: 'query_failed',
        cause: rlsConnectionUrlFailure,
      },
      rlsConnectionUrlFailure
    );
    return Promise.resolve(undefined);
  }

  return assertRlsConnectionRole({
    isProduction: shouldAssertRlsConnectionRole,
    configuredDbRole: process.env.DB_RLS_ROLE,
    queryRolePosture: queryRlsConnectionRolePosture,
  })
    .then(result => {
      rlsConnectionRoleAssertionState = 'passed';
      reportRlsConnectionRoleAssertion(result);
      return result;
    })
    .catch(error => {
      rlsConnectionRoleAssertionState = 'failed';
      rlsConnectionRoleAssertionFailure = error;
      reportRlsConnectionRoleAssertion(resultFromRlsConnectionRoleAssertionError(error), error);
      return undefined;
    });
}

const rlsConnectionRoleAssertion = startRlsConnectionRoleAssertion();

function assertRlsDatabaseClientReady(): void {
  if (!shouldAssertRlsConnectionRole || rlsConnectionRoleAssertionState === 'passed') {
    return;
  }

  if (rlsConnectionRoleAssertionState === 'failed') {
    throw rlsConnectionRoleAssertionFailure instanceof Error
      ? rlsConnectionRoleAssertionFailure
      : new Error('DATABASE_URL_RLS role assertion failed');
  }

  // Pending checks must not make cold-start query builders fail; tenant transactions await readiness.
}

function createAssertedRlsDatabaseClient<TClient extends object>(client: TClient): TClient {
  if (!shouldAssertRlsConnectionRole) {
    return client;
  }

  return new Proxy(client, {
    get(target, property, receiver) {
      assertRlsDatabaseClientReady();
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export async function assertRlsConnectionRoleReady(): Promise<void> {
  await rlsConnectionRoleAssertion;
  if (rlsConnectionRoleAssertionState === 'failed') {
    throw rlsConnectionRoleAssertionFailure instanceof Error
      ? rlsConnectionRoleAssertionFailure
      : new Error('DATABASE_URL_RLS role assertion failed');
  }
}

export const dbAdmin = drizzle(adminQueryClient, { schema });
const dbRlsClient = drizzle(rlsQueryClient, { schema });
export const dbRls = createAssertedRlsDatabaseClient(dbRlsClient);

/**
 * Backward-compatible alias. Prefer explicit dbRls or dbAdmin.
 */
export const db = dbRls;
