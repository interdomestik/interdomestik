// The pg16 lane's one way to a database: a scratch database on a disposable server (R-13), created
// and dropped inside the admin client's lifetime, with the scratch client closed before the drop.
import { randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { assertDisposableTarget } from '../../src/seed-target-guard';

export type ScratchClient = ReturnType<typeof postgres>;

const OPTIONS = { max: 1, onnotice: () => {}, connect_timeout: 10 } as const;

/** Why the suite must skip; undefined with a server; throws when the run requires one. */
export function scratchServerMissing(requiredBy: string): string | undefined {
  if (process.env.DATABASE_URL) return undefined; // an admin URL of a loopback or CI-container server
  if (process.env[requiredBy] === '1')
    throw new Error(`DATABASE_URL is required when ${requiredBy}=1`);
  return 'DATABASE_URL names no disposable server';
}

export async function withScratchDatabase<T>(
  prefix: string,
  work: (client: ScratchClient) => Promise<T>
): Promise<T> {
  // Refuses every server that is not loopback or the confirmed CI container, before connecting.
  assertDisposableTarget(process.env);
  const adminUrl = process.env.DATABASE_URL ?? '';
  const name = `${prefix}_${randomBytes(6).toString('hex')}`;
  const scratchUrl = new URL(adminUrl);
  scratchUrl.pathname = `/${name}`;
  const admin = postgres(adminUrl, OPTIONS);
  try {
    await admin.unsafe(`create database "${name}"`);
    try {
      const client = postgres(scratchUrl.toString(), OPTIONS);
      try {
        return await work(client);
      } finally {
        await client.end({ timeout: 5 });
      }
    } finally {
      await admin.unsafe(`drop database if exists "${name}" with (force)`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }
}

/** Applies a journal folder with the application's own migrator. */
export async function migrateJournal(
  client: ScratchClient,
  migrationsFolder: string
): Promise<void> {
  await migrate(drizzle(client), { migrationsFolder });
}
