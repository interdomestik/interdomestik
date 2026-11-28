import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { withDisposableCleanup, withDisposableClient } from '../../src/disposable-client';
import { quoteIdentifier } from '../rls-test-connection';
import { dedicated, presentRoles, runtime } from './release-foreign-owner.fixture';
import { releasePhaseDatabaseUrl, withReleaseDatabase } from './release-migration-fixture';
import { policy } from './release-migration-journal.fixture';
import type { ScratchClient } from './scratch-database';

export async function withForeignOwnerCluster(work: () => Promise<void>) {
  assert.ok(
    process.env.RELEASE_PHASE_DISPOSABLE_CLUSTER === '1',
    'The 0114 ownership suite creates cluster roles. Set RELEASE_PHASE_DISPOSABLE_CLUSTER=1 only for an exclusively assigned disposable PostgreSQL 16 server.'
  );
  const originalUrl = process.env.DATABASE_URL;
  const url = releasePhaseDatabaseUrl();
  assert.ok(url, 'DATABASE_URL must name the disposable PostgreSQL 16 superuser endpoint');

  await withDisposableClient(url, { applicationName: 'foreign_owner_cluster' }, async admin => {
    const { hostname, port, search, hash } = new URL(url);
    if (hostname !== '127.0.0.1' || !port || search || hash)
      throw new Error('The 0114 ownership suite requires an explicit loopback PostgreSQL endpoint');

    const [{ server_version_num: version }] = await admin`SHOW server_version_num`;
    assert.match(version, /^16\d{4}$/u, 'The 0114 ownership suite requires PostgreSQL 16');
    const [role] =
      await admin`SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = session_user`;
    assert.equal(role.rolsuper, true, 'The 0114 ownership suite requires a superuser login');
    // The maintenance session holds the lock until all cases and their cleanup finish.
    const [lock] = await admin`SELECT pg_catalog.pg_try_advisory_lock(
      pg_catalog.hashtextextended('interdomestik:0114-ownership-fixture', 0)
    ) AS acquired`;
    assert.equal(lock.acquired, true, 'The 0114 ownership suite already uses this server');
    assert.deepEqual(await presentRoles(admin), [], 'Fixture roles must be absent on this server');

    process.env.DATABASE_URL = url;
    try {
      await work();
    } finally {
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
    }
  });
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
      let roles: Awaited<ReturnType<typeof presentRoles>> = [];
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
              return withDisposableCleanup(
                () => work(client, fixture),
                async () => {
                  // The exclusive cluster started without these names. Record the roles this case
                  // left behind even if an assertion failed, before its scratch database is removed.
                  roles = await presentRoles(admin);
                },
                'Foreign owner proof and role inventory both failed'
              );
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
          assert.deepEqual(
            await presentRoles(admin),
            roles,
            'Refusing to drop fixture roles whose identities changed during database teardown'
          );
          if (roles.length > 0) {
            const names = roles.map(({ name }) => quoteIdentifier(name)).join(', ');
            await admin.unsafe(`DROP ROLE ${names}`);
          }
          assert.deepEqual(
            await presentRoles(admin),
            [],
            'Fixture roles must be gone after cleanup'
          );
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
