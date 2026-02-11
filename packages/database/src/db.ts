import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

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

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is missing in db.ts!');
}

function createQueryClient(databaseUrl: string, label: 'admin' | 'rls'): postgres.Sql {
  const configuredMax = parseEnvInt(process.env.DB_MAX_CONNECTIONS, isProduction ? 5 : 10);
  const safeMax = isProduction && isVercelRuntime ? Math.min(configuredMax, 1) : configuredMax;

  return postgres(databaseUrl, {
    max: safeMax,
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
const rlsDatabaseUrl = process.env.DATABASE_URL_RLS ?? adminDatabaseUrl;

const adminQueryClient =
  globalQueryClients.queryClientAdmin ?? createQueryClient(adminDatabaseUrl, 'admin');
const rlsQueryClient =
  globalQueryClients.queryClientRls ??
  (rlsDatabaseUrl === adminDatabaseUrl
    ? adminQueryClient
    : createQueryClient(rlsDatabaseUrl, 'rls'));

globalQueryClients.queryClientAdmin = adminQueryClient;
globalQueryClients.queryClientRls = rlsQueryClient;

export const dbAdmin = drizzle(adminQueryClient, { schema });
export const dbRls = drizzle(rlsQueryClient, { schema });

/**
 * Backward-compatible alias. Prefer explicit dbRls or dbAdmin.
 */
export const db = dbRls;
