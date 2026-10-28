import postgres from 'postgres';

import { CONFIGURATION } from './database-configuration';

export { CONFIGURATION } from './database-configuration';

export const isProduction = CONFIGURATION.NODE_ENV === 'production';
const isVercelRuntime = CONFIGURATION.VERCEL === '1';

function parseEnvInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

export function createQueryClient(
  databaseUrl: string,
  label: 'admin' | 'rls',
  connectionLimit?: 1
): postgres.Sql {
  const configuredMax = parseEnvInt(CONFIGURATION.DB_MAX_CONNECTIONS, isProduction ? 5 : 10);
  const safeMax = isProduction && isVercelRuntime ? Math.min(configuredMax, 1) : configuredMax;

  return postgres(databaseUrl, {
    max: connectionLimit ?? safeMax,
    ssl: isProduction && !isLocalDatabaseUrl(databaseUrl) ? 'require' : false,
    idle_timeout: parseEnvInt(CONFIGURATION.DB_IDLE_TIMEOUT, isProduction ? 10 : 20),
    connect_timeout: parseEnvInt(CONFIGURATION.DB_CONNECT_TIMEOUT, 10),
    max_lifetime: parseEnvInt(CONFIGURATION.DB_MAX_LIFETIME, 1800),
    onnotice: notice => {
      if (isProduction) {
        console.warn(`[database:${label}] notice:`, notice);
      }
    },
  });
}
