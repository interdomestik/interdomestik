import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalQueryClient = global as unknown as { queryClient: postgres.Sql };

const queryClient = globalQueryClient.queryClient || postgres(process.env.DATABASE_URL!);

if (process.env.NODE_ENV !== 'production') {
  globalQueryClient.queryClient = queryClient;
}

export const db = drizzle(queryClient, { schema });
