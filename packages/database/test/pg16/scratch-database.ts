// The pg16 lane's one way to a database: a scratch database on a disposable server, created and
// dropped inside the admin client's lifetime, with the scratch client closed before the drop. Both
// clients come from the guarded factory, which refuses every server that is not loopback or the
// confirmed CI container before it constructs a driver (R-13).
import { randomBytes } from 'node:crypto';
import { type DisposableClient, withDisposableClient } from '../../src/disposable-client';
import { assertDisposableTarget } from '../../src/seed-target-guard';

export type ScratchClient = DisposableClient;
export { migrateJournal } from './journal-migrator';

/** Why the suite must skip; undefined with a server; throws when the run requires one. */
export function scratchServerMissing(requiredBy: string): string | undefined {
  if (process.env.DATABASE_URL) return undefined; // an admin URL of a loopback or CI-container server
  if (process.env[requiredBy] === '1')
    throw new Error(`DATABASE_URL is required when ${requiredBy}=1`);
  return 'DATABASE_URL names no disposable server';
}

export async function withScratchDatabase<T>(
  prefix: string,
  work: (client: ScratchClient, maintenance: ScratchClient) => Promise<T>,
  { maxConnections, loopbackOnly }: { maxConnections?: number; loopbackOnly?: boolean } = {}
): Promise<T> {
  const adminUrl = process.env.DATABASE_URL ?? '';
  if (loopbackOnly) {
    // Without CI confirmation the target guard admits only loopback.
    const { PGHOST, PGHOSTADDR, PGUSER, PGUSERNAME } = process.env;
    assertDisposableTarget({ DATABASE_URL: adminUrl, PGHOST, PGHOSTADDR, PGUSER, PGUSERNAME });
  }
  const name = `${prefix}_${randomBytes(6).toString('hex')}`;
  let workFailure: { error: unknown } | undefined;
  try {
    return await withDisposableClient(
      adminUrl,
      { applicationName: 'wp04_scratch_admin' },
      async admin => {
        const scratchUrl = new URL(adminUrl);
        scratchUrl.pathname = `/${name}`;
        await admin.unsafe(`create database "${name}"`);
        try {
          return await withDisposableClient(
            scratchUrl.toString(),
            { applicationName: 'wp04_scratch', max: maxConnections },
            async client => {
              try {
                return await work(client, admin);
              } catch (error) {
                workFailure = { error };
                throw error;
              }
            }
          );
        } finally {
          await admin.unsafe(`drop database if exists "${name}" with (force)`);
        }
      }
    );
  } catch (error) {
    if (workFailure && !Object.is(error, workFailure.error)) {
      throw new AggregateError(
        [workFailure.error, error],
        'Scratch database work and teardown both failed',
        {
          cause: workFailure.error,
        }
      );
    }
    throw error;
  }
}
