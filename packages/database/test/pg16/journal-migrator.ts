// Applies a journal folder with the application's own migrator to a client it is given. It cannot
// open a connection: the client comes from the guarded factory (scratch-database.ts, R-13).
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { DisposableClient } from '../../src/disposable-client';

export async function migrateJournal(
  client: DisposableClient,
  migrationsFolder: string
): Promise<void> {
  await migrate(drizzle(client), { migrationsFolder });
}
