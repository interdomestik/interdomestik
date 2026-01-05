import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalQueryClient = global as unknown as { queryClient: postgres.Sql };

const queryClient =
  globalQueryClient.queryClient ||
  postgres(process.env.DATABASE_URL!, {
    max:
      process.env.NODE_ENV === 'production'
        ? parseInt(process.env.DB_MAX_CONNECTIONS || '50')
        : parseInt(process.env.DB_MAX_CONNECTIONS || '10'),
    idle_timeout: parseInt(process.env.DB_IDLE_TIMEOUT || '20') * 1000,
    connect_timeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '10') * 1000,
    max_lifetime: parseInt(process.env.DB_MAX_LIFETIME || '3600') * 1000,
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
