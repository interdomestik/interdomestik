import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalQueryClient = global as unknown as { queryClient: postgres.Sql };

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is missing in db.ts!');
} else {
  console.log('✅ db.ts initialized with DATABASE_URL length:', process.env.DATABASE_URL.length);
}

const queryClient =
  globalQueryClient.queryClient ||
  postgres(process.env.DATABASE_URL!, {
    max:
      process.env.NODE_ENV === 'production'
        ? Number.parseInt(process.env.DB_MAX_CONNECTIONS || '50')
        : Number.parseInt(process.env.DB_MAX_CONNECTIONS || '10'),
    idle_timeout: Number.parseInt(process.env.DB_IDLE_TIMEOUT || '20'),
    connect_timeout: Number.parseInt(process.env.DB_CONNECT_TIMEOUT || '10'),
    max_lifetime: Number.parseInt(process.env.DB_MAX_LIFETIME || '3600'),
    // Add connection monitoring
    onnotice: notice => {
      if (process.env.NODE_ENV === 'production') {
        console.warn('Database notice:', notice);
      }
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalQueryClient.queryClient = queryClient;
}

export const db = drizzle(queryClient, { schema });
