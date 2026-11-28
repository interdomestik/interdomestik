import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { withDisposableCleanup, withDisposableClient } from '../../src/disposable-client';
import { quoteIdentifier } from '../rls-test-connection';
import { dedicated, presentRoles, runtime } from './release-foreign-owner.fixture';
import { withReleaseDatabase } from './release-migration-fixture';
import { policy, workspace } from './release-migration-journal.fixture';
import type { ScratchClient } from './scratch-database';

function serverBin() {
  const configured = process.env.RELEASE_PHASE_PG16_BIN;
  const candidates = configured
    ? [configured]
    : [
        '/usr/lib/postgresql/16/bin',
        '/opt/homebrew/opt/postgresql@16/bin',
        '/usr/local/opt/postgresql@16/bin',
      ];
  const bin = candidates.find(dir => existsSync(join(dir, 'initdb')));
  assert.ok(bin, 'Set RELEASE_PHASE_PG16_BIN to the disposable PostgreSQL 16 server bin directory');
  const version = execFileSync(join(bin, 'postgres'), ['--version'], { encoding: 'utf8' });
  assert.match(version, /^postgres \(PostgreSQL\) 16\./u);
  return bin;
}

async function loopbackPort() {
  const server = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      resolve(address.port);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
  return port;
}

// The journal-parity service can already contain the fixed roles from db:migrate.
// A private cluster makes the fresh-creator cases independent of every other lane.
export async function withForeignOwnerCluster(t: TestContext, work: () => Promise<void>) {
  const bin = serverBin();
  const dir = workspace(t);
  const data = join(dir, 'data');
  const port = await loopbackPort();
  const password = randomBytes(24).toString('hex');
  // Node's stdio can be a socket. Reopen a POSIX pipe as /dev/stdin without a password file.
  execFileSync(
    '/bin/sh',
    [
      '-c',
      '/bin/cat | "$@"',
      'initdb-password-pipe',
      join(bin, 'initdb'),
      '-D',
      data,
      '--username=postgres',
      '--auth=scram-sha-256',
      '--pwfile=/dev/stdin',
      '--encoding=UTF8',
      '--locale=C',
    ],
    { input: password + '\n', stdio: 'pipe' }
  );

  const originalUrl = process.env.DATABASE_URL;
  await withDisposableCleanup(
    async () => {
      const settings =
        `-h 127.0.0.1 -p ${port} -c unix_socket_directories=` +
        ' -c log_min_error_statement=panic -c autovacuum=off';
      execFileSync(
        join(bin, 'pg_ctl'),
        ['-D', data, '-l', join(dir, 'server.log'), '-w', '-t', '30', '-o', settings, 'start'],
        { stdio: 'pipe' }
      );
      process.env.DATABASE_URL = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
      await work();
    },
    async () => {
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
      if (existsSync(join(data, 'postmaster.pid'))) {
        execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-w', '-t', '30', '-m', 'fast', 'stop'], {
          stdio: 'pipe',
        });
      }
    },
    'Foreign-owner journal proof and disposable cluster shutdown both failed'
  );
}

type Inputs = Parameters<typeof withReleaseDatabase>[1];
type Work = Parameters<typeof withReleaseDatabase>[2];

export async function withCapabilityDatabase(
  inputs: Omit<Inputs, 'registry'> & { registry?: string },
  work: Work
) {
  return withDisposableClient(
    process.env.DATABASE_URL ?? '',
    { applicationName: 'foreign_owner_role_fixture' },
    async admin => {
      assert.deepEqual(
        await presentRoles(admin),
        [],
        'fixture roles must be absent before creation'
      );
      let database: string | undefined;
      return withDisposableCleanup(
        () =>
          withReleaseDatabase(
            'interdomestik_admin_config_owner',
            { ...inputs, registry: inputs.registry ?? policy },
            async (client, fixture) => {
              const [identity] = await client<{ name: string }[]>`
                SELECT current_database() AS name
              `;
              database = identity.name;
              return work(client, fixture);
            }
          ),
        async () => {
          if (database) {
            const [existing] = await admin`
              SELECT 1 FROM pg_catalog.pg_database WHERE datname = ${database}
            `;
            assert.equal(
              existing,
              undefined,
              'remove fixture roles only after the database is gone'
            );
          }
          for (const { name } of await presentRoles(admin))
            await admin.unsafe(`DROP ROLE ${quoteIdentifier(name)}`);
        },
        'Foreign owner proof and role cleanup both failed'
      );
    }
  );
}

export async function createRuntimeLogin(client: ScratchClient) {
  const password = randomBytes(24).toString('hex');
  await client.unsafe(
    `CREATE ROLE ${runtime} LOGIN NOSUPERUSER NOINHERIT NOBYPASSRLS PASSWORD '${password}'`
  );
  const [db] = await client`SELECT current_database() AS name`;
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/${db.name}`;
  url.username = runtime;
  url.password = password;
  return url;
}

export async function proveRuntimeDenials(url: URL) {
  await withDisposableClient(
    url.toString(),
    { applicationName: 'release_runtime_denied' },
    async sql => {
      const [session] = await sql`SELECT session_user AS login, current_user AS role`;
      assert.deepEqual(session, { login: runtime, role: runtime });
      const [receipt] = await sql`SELECT has_table_privilege(
        current_user, 'public.claim_inbound_object_verifications', 'SELECT'
      ) AS can_read`;
      assert.equal(receipt.can_read, true, '0114 grants read access to the enrolled runtime role');
      for (const owner of dedicated)
        await assert.rejects(sql.unsafe(`SET ROLE ${owner}`), { code: '42501' });
      await assert.rejects(
        sql`SELECT public.record_claim_inbound_object_verification(
          '00000000-0000-0000-0000-000000000001'::uuid, 'synthetic', 'synthetic', 1, 'synthetic'
        )`,
        {
          code: '42501',
          message: /permission denied for function record_claim_inbound_object_verification/u,
        }
      );
    }
  );
}
