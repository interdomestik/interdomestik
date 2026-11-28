// The pg16 lane's one way to a database: a scratch database on a disposable server, created and
// dropped inside the admin client's lifetime, with the scratch client closed before the drop. Both
// clients come from the guarded factory, which refuses every server that is not loopback or the
// confirmed CI container before it constructs a driver (R-13).
import { randomBytes } from 'node:crypto';
import {
  type DisposableClient,
  withDisposableCleanup,
  withDisposableClient,
} from '../../src/disposable-client';
import { assertDisposableTarget } from '../../src/seed-target-guard';
import { quoteIdentifier } from '../rls-test-connection';

export type ScratchClient = DisposableClient;
export { migrateJournal } from './journal-migrator';

/** Why the suite must skip; undefined with a server; throws when the run requires one. */
export function scratchServerMissing(
  requiredBy: string,
  adminUrl = process.env.DATABASE_URL
): string | undefined {
  if (adminUrl) return undefined; // an admin URL of a loopback or CI-container server
  if (process.env[requiredBy] === '1')
    throw new Error(`DATABASE_URL is required when ${requiredBy}=1`);
  return 'DATABASE_URL names no disposable server';
}

export async function withScratchDatabase<T>(
  prefix: string,
  work: (client: ScratchClient, maintenance: ScratchClient, scratchUrl: URL) => Promise<T>,
  {
    adminUrl = process.env.DATABASE_URL ?? '',
    loopbackOnly,
    maxConnections,
    owner,
    requirePg16,
  }: {
    adminUrl?: string;
    loopbackOnly?: boolean;
    maxConnections?: number;
    owner?: string;
    requirePg16?: boolean;
  } = {}
): Promise<T> {
  if (loopbackOnly) {
    // Without CI confirmation the target guard admits only loopback.
    const { PGHOST, PGHOSTADDR, PGUSER, PGUSERNAME } = process.env;
    assertDisposableTarget({ DATABASE_URL: adminUrl, PGHOST, PGHOSTADDR, PGUSER, PGUSERNAME });
  }
  const name = `${prefix}_${randomBytes(6).toString('hex')}`;
  return withDisposableClient(adminUrl, { applicationName: 'wp04_scratch_admin' }, async admin => {
    if (requirePg16) {
      const [{ server_version_num: version }] = await admin`SHOW server_version_num`;
      if (!/^16\d{4}$/u.test(version)) throw new Error('Scratch test requires PostgreSQL 16');
    }
    const scratchUrl = new URL(adminUrl);
    scratchUrl.pathname = `/${name}`;
    return withCreatedScratchDatabase(
      admin,
      name,
      () =>
        withDisposableClient(
          scratchUrl.toString(),
          { applicationName: 'wp04_scratch', max: maxConnections },
          client => work(client, admin, scratchUrl)
        ),
      owner
    );
  });
}

type DatabaseIdentity = { oid: string; name: string; owner: string };

export async function withCreatedScratchDatabase<T>(
  admin: Pick<ScratchClient, 'unsafe'>,
  name: string,
  work: () => Promise<T>,
  owner?: string
): Promise<T> {
  if (name.length > 63 || !/^[a-z][a-z0-9_]*_[0-9a-f]{12}$/u.test(name)) {
    throw new Error(
      'Invalid scratch database identifier (expected a generated name of up to 63 ASCII bytes)'
    );
  }

  const identifier = quoteIdentifier(name);
  const ownerClause = owner ? ` owner ${quoteIdentifier(owner)}` : '';
  await admin.unsafe(`create database ${identifier}${ownerClause}`);
  const [created] = await admin.unsafe<DatabaseIdentity[]>(
    `select oid::text as oid, datname as name, datdba::text as owner
     from pg_catalog.pg_database where datname = $1`,
    [name]
  );
  if (created?.name !== name) {
    throw new Error(`Cannot record identity of scratch database ${identifier} after creation`);
  }

  return withDisposableCleanup(
    work,
    async () => {
      const [current] = await admin.unsafe<Pick<DatabaseIdentity, 'name' | 'owner'>[]>(
        `select datname as name, datdba::text as owner
         from pg_catalog.pg_database where oid = $1::oid`,
        [created.oid]
      );
      if (!current) {
        throw new Error(
          `Refusing to drop scratch database ${identifier}: OID ${created.oid} is missing`
        );
      }
      if (current.name !== created.name || current.owner !== created.owner) {
        throw new Error(
          `Refusing to drop scratch database ${identifier}: name or owner changed for OID ${created.oid}`
        );
      }
      await admin.unsafe(`drop database ${identifier} with (force)`);
    },
    'Scratch database work and teardown both failed'
  );
}
