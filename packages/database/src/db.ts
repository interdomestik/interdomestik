import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalQueryClient = global as unknown as { queryClient: postgres.Sql };
const isProduction = process.env.NODE_ENV === 'production';
const isVercelRuntime = process.env.VERCEL === '1';

function parseEnvInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is missing in db.ts!');
} else {
  console.log('✅ db.ts initialized with DATABASE_URL length:', process.env.DATABASE_URL.length);
}

const queryClient =
  globalQueryClient.queryClient ||
  (() => {
    // Session-mode pooled DBs can exhaust quickly in serverless if max is too high.
    const configuredMax = parseEnvInt(process.env.DB_MAX_CONNECTIONS, isProduction ? 5 : 10);
    const safeMax = isProduction && isVercelRuntime ? Math.min(configuredMax, 1) : configuredMax;

    return postgres(process.env.DATABASE_URL!, {
      max: safeMax,
      idle_timeout: parseEnvInt(process.env.DB_IDLE_TIMEOUT, isProduction ? 10 : 20),
      connect_timeout: parseEnvInt(process.env.DB_CONNECT_TIMEOUT, 10),
      max_lifetime: parseEnvInt(process.env.DB_MAX_LIFETIME, 1800),
      // Add connection monitoring
      onnotice: notice => {
        if (isProduction) {
          console.warn('Database notice:', notice);
        }
      },
    });
  })();

// Reuse per-runtime client in all environments to reduce connection churn.
globalQueryClient.queryClient = queryClient;

export const db = drizzle(queryClient, { schema });
