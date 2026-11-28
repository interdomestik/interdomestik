import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { quoteIdentifier } from '../rls-test-connection';
import {
  attempts,
  codes,
  enrolledOwner,
  grantor,
  guard,
  lock,
  lockDefinition,
  memberships,
  publicCatalogSnapshot,
  receipt,
  refuseExpandUnchanged,
  verifier,
  writer,
  type Fixture,
} from './release-foreign-owner.fixture';
import { assertLedger, assertRefusal, scratchOptions } from './release-migration-fixture';
import { type ScratchClient, withScratchDatabase } from './scratch-database';

type Drift = readonly [name: string, apply: string, restore: string, reason?: string];

const dropLock = `DROP FUNCTION ${lock}`;
const restoreLock = `${lockDefinition()}; ALTER FUNCTION ${lock} OWNER TO ${guard};
  REVOKE EXECUTE ON FUNCTION ${lock} FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION ${lock} TO ${writer}`;

export async function proveDrift(
  t: TestContext,
  client: ScratchClient,
  fixture: Fixture,
  originalManifest: { RELEASE_PHASE_MANIFEST: string }
) {
  const owner = await enrolledOwner(client);
  const [bootstrap] = await client<{ name: string }[]>`
    SELECT rolname::text AS name FROM pg_catalog.pg_roles WHERE oid = 10
  `;
  const bootstrapRole = quoteIdentifier(bootstrap.name);
  const createAdminOnly = (member: string) =>
    `GRANT ${guard} TO ${member} WITH ADMIN TRUE, INHERIT FALSE, SET FALSE GRANTED BY ${bootstrapRole}`;
  const revoke = (member: string) => `REVOKE ${guard} FROM ${member} GRANTED BY ${bootstrapRole}`;
  await client.unsafe(`CREATE ROLE ${grantor} NOLOGIN`);
  // prettier-ignore
  const cases: Drift[] = [
    ['unlisted foreign function',
      "CREATE FUNCTION public.release_drift() RETURNS integer LANGUAGE sql AS 'SELECT 1'",
      'DROP FUNCTION public.release_drift()'],
    ['foreign overload of a pinned routine',
      "CREATE FUNCTION public.claim_inbound_lock_staff_branch(integer,text) RETURNS bool LANGUAGE sql AS 'SELECT false'",
      'DROP FUNCTION public.claim_inbound_lock_staff_branch(integer,text)'],
    ['pinned routine owned by the other dedicated role',
      `ALTER FUNCTION ${lock} OWNER TO ${writer}`,
      `ALTER FUNCTION ${lock} OWNER TO ${guard}`],
    ['pinned routine owned by an unrelated role',
      `ALTER FUNCTION ${lock} OWNER TO ${bootstrapRole}`,
      `ALTER FUNCTION ${lock} OWNER TO ${guard}`],
    ['pinned routine owned by the migration login',
      `ALTER FUNCTION ${lock} OWNER TO ${owner}`,
      `ALTER FUNCTION ${lock} OWNER TO ${guard}`],
    ['verifier-owned public function',
      `CREATE FUNCTION public.release_drift() RETURNS integer LANGUAGE sql AS 'SELECT 1';
       ALTER FUNCTION public.release_drift() OWNER TO ${verifier}`,
      'DROP FUNCTION public.release_drift()'],
    ['foreign relation',
      'CREATE SEQUENCE public.release_drift_sequence',
      'DROP SEQUENCE public.release_drift_sequence'],
    ['foreign type',
      "CREATE TYPE public.release_drift_type AS ENUM ('fixture')",
      'DROP TYPE public.release_drift_type'],
    ['foreign operator',
      'CREATE OPERATOR public.=== (LEFTARG = integer, RIGHTARG = integer, FUNCTION = pg_catalog.int4eq)',
      'DROP OPERATOR public.=== (integer,integer)'],
    ['foreign collation',
      'CREATE COLLATION public.release_drift_collation FROM pg_catalog."C"',
      'DROP COLLATION public.release_drift_collation'],
    ['foreign conversion',
      `DO $fixture$ BEGIN EXECUTE format(
        'CREATE CONVERSION public.release_drift_conversion FOR ''LATIN1'' TO ''UTF8'' FROM %s',
        (SELECT conproc FROM pg_catalog.pg_conversion
          WHERE connamespace = 'pg_catalog'::regnamespace
            AND conforencoding = pg_char_to_encoding('LATIN1')
            AND contoencoding = pg_char_to_encoding('UTF8') AND condefault)
      ); END $fixture$`,
      'DROP CONVERSION public.release_drift_conversion'],
    ['foreign operator class in a migration-owned family',
      `SET LOCAL ROLE ${owner}; CREATE OPERATOR FAMILY public.release_fixture_family USING btree;
       RESET ROLE;
       CREATE OPERATOR CLASS public.release_drift_opclass FOR TYPE integer USING btree
       FAMILY public.release_fixture_family AS OPERATOR 1 pg_catalog.< (integer, integer),
       FUNCTION 1 pg_catalog.btint4cmp(integer, integer)`,
      'DROP OPERATOR CLASS public.release_drift_opclass USING btree; DROP OPERATOR FAMILY public.release_fixture_family USING btree'],
    ['foreign operator family',
      'CREATE OPERATOR FAMILY public.release_drift_family USING btree',
      'DROP OPERATOR FAMILY public.release_drift_family USING btree'],
    ['foreign text search configuration',
      'CREATE TEXT SEARCH CONFIGURATION public.release_drift_config (COPY = pg_catalog.simple)',
      'DROP TEXT SEARCH CONFIGURATION public.release_drift_config'],
    ['foreign text search dictionary',
      'CREATE TEXT SEARCH DICTIONARY public.release_drift_dictionary (TEMPLATE = pg_catalog.simple)',
      'DROP TEXT SEARCH DICTIONARY public.release_drift_dictionary'],
    ['body drift with the original attributes',
      lockDefinition().replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
        .replace('RETURN FOUND;', 'RETURN false;'),
      lockDefinition().replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'), codes.definition],
    ['same routine identity and owner with procedure kind',
      `${dropLock}; SET LOCAL check_function_bodies = off;
       ${lockDefinition().replace('CREATE FUNCTION', 'CREATE PROCEDURE').replace(' RETURNS boolean', '')};
       ALTER PROCEDURE ${lock} OWNER TO ${guard}`,
      `DROP PROCEDURE ${lock}; ${restoreLock}`, codes.definition],
    ['result drift with the original function body',
      `${dropLock}; SET LOCAL check_function_bodies = off;
       ${lockDefinition().replace(' RETURNS boolean', ' RETURNS text')};
       ALTER FUNCTION ${lock} OWNER TO ${guard}`,
      `${dropLock}; ${restoreLock}`, codes.definition],
    ['function search path drift', `ALTER FUNCTION ${lock} SET search_path TO pg_temp`,
      `ALTER FUNCTION ${lock} SET search_path TO pg_catalog, pg_temp`, codes.definition],
    ['receipt row security setting removed', `ALTER FUNCTION ${receipt} RESET row_security`,
      `ALTER FUNCTION ${receipt} SET row_security TO on`, codes.definition],
    ['additional function setting', `ALTER FUNCTION ${lock} SET statement_timeout TO '1s'`,
      `ALTER FUNCTION ${lock} RESET statement_timeout`, codes.definition],
    ['SECURITY DEFINER removed', `ALTER FUNCTION ${lock} SECURITY INVOKER`,
      `ALTER FUNCTION ${lock} SECURITY DEFINER`, codes.definition],
    ['outgoing membership', `GRANT ${grantor} TO ${guard} WITH INHERIT FALSE, SET FALSE`,
      `REVOKE ${grantor} FROM ${guard}`, codes.role],
    ['incoming SET permission', `GRANT ${guard} TO ${owner} WITH ADMIN TRUE, INHERIT FALSE, SET TRUE`,
      revoke(owner), codes.role],
    ['incoming INHERIT permission', `GRANT ${guard} TO ${owner} WITH ADMIN TRUE, INHERIT TRUE, SET FALSE`,
      revoke(owner), codes.role],
    ['incoming edge without ADMIN permission', `GRANT ${guard} TO ${owner} WITH ADMIN FALSE, INHERIT FALSE, SET FALSE`,
      revoke(owner), codes.role],
    ['incoming admin-only edge to the wrong creator', createAdminOnly(grantor),
      revoke(grantor), codes.role],
    ['additional incoming edge', `${createAdminOnly(owner)}; ${createAdminOnly(grantor)}`,
      `${revoke(owner)}; ${revoke(grantor)}`, codes.role],
    ['dedicated role owns an object in another schema',
      `CREATE SCHEMA release_drift_hidden; CREATE TABLE release_drift_hidden.owned (id int);
       ALTER TABLE release_drift_hidden.owned OWNER TO ${guard}`,
      'DROP SCHEMA release_drift_hidden CASCADE'],
    ['direct public CREATE violates base schema authority',
      `GRANT CREATE ON SCHEMA public TO ${guard}`,
      `REVOKE CREATE ON SCHEMA public FROM ${guard}`, codes.public],
    ['wrong public schema owner', `ALTER SCHEMA public OWNER TO ${bootstrapRole}`,
      `ALTER SCHEMA public OWNER TO ${owner}`, codes.public],
    ['unsafe PUBLIC schema CREATE', 'GRANT CREATE ON SCHEMA public TO PUBLIC',
      'REVOKE CREATE ON SCHEMA public FROM PUBLIC', codes.public],
    ['system routine name and signature collision',
      `SET LOCAL ROLE ${owner}; CREATE FUNCTION public.abs(integer) RETURNS integer LANGUAGE sql AS 'SELECT $1'`,
      'DROP FUNCTION public.abs(integer)', codes.public],
  ];
  const attributes = [
    'LOGIN',
    'INHERIT',
    'BYPASSRLS',
    'SUPERUSER',
    'CREATEROLE',
    'CREATEDB',
    'REPLICATION',
  ];
  for (const attribute of attributes) {
    cases.push([
      `owner attribute ${attribute}`,
      `ALTER ROLE ${guard} ${attribute}`,
      `ALTER ROLE ${guard} NO${attribute}`,
      codes.role,
    ]);
  }

  for (const [name, apply, restore, reason = codes.owner] of cases) {
    await t.test(name, async () => {
      await fixture.expand();
      await client.begin(async tx => {
        await tx.unsafe(apply).simple();
      });
      try {
        await refuseExpandUnchanged(client, fixture, reason, 116);
      } finally {
        await client.begin(async tx => {
          await tx.unsafe(restore).simple();
        });
      }
    });
  }

  await t.test('incoming admin-only edge with the correct member and wrong grantor', async () => {
    await fixture.expand();
    const setGrantor = (from: string, to: string) => client`
      UPDATE pg_catalog.pg_auth_members SET grantor = ${to}::regrole
      WHERE roleid = ${guard}::regrole AND member = ${owner}::regrole
        AND grantor = ${from}::regrole
    `;
    await client.unsafe(createAdminOnly(owner));
    try {
      await fixture.expand();
      // PG16 requires ADMIN for a non-bootstrap grantor. On this disposable cluster, change
      // just the grantor so a second incoming membership cannot also trigger the refusal.
      const updated = await setGrantor(bootstrapRole, grantor);
      assert.equal(updated.count, 1);
      const [wrongGrantor] =
        await client`SELECT oid::int AS oid FROM pg_catalog.pg_roles WHERE rolname = ${grantor}`;
      assert.deepEqual(await memberships(client), [
        {
          owner: guard,
          member: owner.slice(1, -1),
          grantor: wrongGrantor.oid,
          admin: true,
          inherit: false,
          can_set: false,
        },
      ]);
      await refuseExpandUnchanged(client, fixture, codes.role, 116);
    } finally {
      await setGrantor(grantor, bootstrapRole);
      await client.unsafe(revoke(owner));
      assert.deepEqual(await memberships(client), []);
    }
  });

  await t.test(
    'inherited public CREATE is refused even when the base schema check permits SET',
    async () => {
      await fixture.expand();
      await client.unsafe(`GRANT ${owner} TO ${guard} WITH INHERIT TRUE, SET TRUE`);
      try {
        const [observed] =
          await client`SELECT has_schema_privilege(${guard}, 'public', 'CREATE') AS allowed`;
        assert.equal(observed.allowed, true);
        await refuseExpandUnchanged(client, fixture, codes.role, 116);
      } finally {
        await client.unsafe(`REVOKE ${owner} FROM ${guard}`);
      }
    }
  );

  await t.test('an ownership dependency in a sibling database is refused', async () => {
    await fixture.expand();
    await withScratchDatabase(
      'owner_sibling',
      async sibling => {
        await sibling
          .unsafe(
            `CREATE TABLE public.release_drift_sibling (id int);
        ALTER TABLE public.release_drift_sibling OWNER TO ${writer}`
          )
          .simple();
        const [owned] = await sibling`SELECT relowner::regrole::text AS owner FROM pg_class
        WHERE oid = 'public.release_drift_sibling'::regclass`;
        assert.equal(owned.owner, writer);
        await refuseExpandUnchanged(client, fixture, codes.owner, 116);
        const [unchanged] = await sibling`SELECT relowner::regrole::text AS owner FROM pg_class
        WHERE oid = 'public.release_drift_sibling'::regclass`;
        assert.deepEqual(unchanged, owned);
      },
      scratchOptions
    );
  });

  await t.test(
    'read-only recovery reports ownership drift before the later ledger boundary',
    async () => {
      await fixture.expand();
      await client`CREATE FUNCTION public.release_drift() RETURNS integer LANGUAGE sql AS 'SELECT 1'`;
      try {
        const before = await publicCatalogSnapshot(client);
        const priorAttempts = await attempts(client);
        assertRefusal(await fixture.run('recover', originalManifest), codes.owner);
        await assertLedger(client, fixture.journal, 116);
        assert.deepEqual(await publicCatalogSnapshot(client), before);
        assert.deepEqual(await attempts(client), priorAttempts);
      } finally {
        await client`DROP FUNCTION public.release_drift()`;
      }
    }
  );
}
