// The pg16 lane's one way to a database: a scratch database on a disposable server, created and
// dropped inside the admin client's lifetime, with the scratch client closed before the drop. Both
// clients come from the guarded factory, which refuses every server that is not loopback or the
// confirmed CI container before it constructs a driver (R-13).
import { randomBytes } from 'node:crypto';
import { type DisposableClient, withDisposableClient } from '../../src/disposable-client';

export type ScratchClient = DisposableClient;
export { migrateJournal } from './journal-migrator';

/** Why the suite must skip; undefined with a server; throws when the run requires one. */
export function scratchServerMissing(requiredBy: string): string | undefined {
  if (process.env.DATABASE_URL) return undefined; // an admin URL of a loopback or CI-container server
  if (process.env[requiredBy] === '1')
    throw new Error(`DATABASE_URL is required when ${requiredBy}=1`);
  return 'DATABASE_URL names no disposable server';
}

export function withScratchDatabase<T>(
  prefix: string,
  work: (client: ScratchClient) => Promise<T>
): Promise<T> {
  const adminUrl = process.env.DATABASE_URL ?? '';
  const name = `${prefix}_${randomBytes(6).toString('hex')}`;
  // The factory classifies (and, on refusal, redacts) the admin URL before anything parses it here.
  return withDisposableClient(adminUrl, { applicationName: 'wp04_scratch_admin' }, async admin => {
    const scratchUrl = new URL(adminUrl);
    scratchUrl.pathname = `/${name}`;
    await admin.unsafe(`create database "${name}"`);
    try {
      return await withDisposableClient(
        scratchUrl.toString(),
        { applicationName: 'wp04_scratch' },
        work
      );
    } finally {
      await admin.unsafe(`drop database if exists "${name}" with (force)`);
    }
  });
}
