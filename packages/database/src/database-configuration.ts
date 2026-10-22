export const CONFIGURATION = Object.freeze({
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_URL_RLS: process.env.DATABASE_URL_RLS,
  DB_RLS_ROLE: process.env.DB_RLS_ROLE,
  REQUIRE_RLS_INTEGRATION: process.env.REQUIRE_RLS_INTEGRATION,
  DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
  DB_CONNECT_TIMEOUT: process.env.DB_CONNECT_TIMEOUT,
  DB_IDLE_TIMEOUT: process.env.DB_IDLE_TIMEOUT,
  DB_MAX_LIFETIME: process.env.DB_MAX_LIFETIME,
  INTERDOMESTIK_DB_PROFILE_SHA256: process.env.INTERDOMESTIK_DB_PROFILE_SHA256,
} as const);

// This checks actual live fields; the optional process-profile marker grants no authority.
const BOOTSTRAP_KEYS = [
  'NODE_ENV',
  'VERCEL',
  'DATABASE_URL',
  'DATABASE_URL_RLS',
  'DB_RLS_ROLE',
  'REQUIRE_RLS_INTEGRATION',
  'DB_MAX_CONNECTIONS',
  'DB_CONNECT_TIMEOUT',
  'DB_IDLE_TIMEOUT',
  'DB_MAX_LIFETIME',
] as const;

export function assertDatabaseConfigurationUnchanged(): void {
  for (const key of BOOTSTRAP_KEYS) {
    if (process.env[key] !== CONFIGURATION[key]) {
      throw new Error('Database configuration changed after capture: ' + key);
    }
  }
}
