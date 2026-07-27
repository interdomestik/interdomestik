import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import postgres from 'postgres';
import {
  startMigrationExecutionHarness,
  type MigrationExecutionHarness,
} from './migration-execution.support';

let harness: MigrationExecutionHarness;

before(async () => {
  harness = await startMigrationExecutionHarness();
});

after(async () => {
  const receipt = await harness.close();
  assert(receipt.removedAt);
});

test('rejects a stale non-owner public collision before callback execution', async () => {
  await harness.reset('schema_absent');
  await harness.setup.unsafe('CREATE TABLE public.stale_now_marker (hit boolean NOT NULL)');
  await harness.setup.unsafe(`GRANT CREATE ON SCHEMA public TO ${harness.nonowner}`);
  const nonowner = postgres(harness.fixture.nonownerEnv.DATABASE_URL, {
    max: 1,
    onnotice: () => {},
  });
  try {
    await nonowner.unsafe(`
      CREATE FUNCTION public.now() RETURNS timestamptz
      LANGUAGE plpgsql VOLATILE AS $function$
      BEGIN
        INSERT INTO public.stale_now_marker VALUES (true);
        RETURN pg_catalog.clock_timestamp();
      END
      $function$
    `);
  } finally {
    await nonowner.end({ timeout: 1 });
  }
  await harness.setup.unsafe(`REVOKE CREATE ON SCHEMA public FROM ${harness.nonowner}`);

  const inventory = await harness.setup<
    { collision_count: number; owned_by_nonowner: boolean | null }[]
  >`
    SELECT count(*)::int AS collision_count,
      bool_and(r.rolname = ${harness.nonowner}) AS owned_by_nonowner
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'public' AND p.proname = 'now'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
  `;
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0]?.collision_count, 1);
  assert.equal(inventory[0]?.owned_by_nonowner, true);

  const result = await harness.run({ failCallbackAt: 0 });
  assert.equal(result.outer.ok, true);
  assert.deepEqual(result.execution, {
    ok: false,
    error: { code: 'MIGRATION_EXECUTION_PUBLIC_SCHEMA_REJECTED' },
  });
  const marker = await harness.setup<{ count: number }[]>`
    SELECT count(*)::int AS count FROM public.stale_now_marker
  `;
  assert.equal(marker[0]?.count, 0);
  assert.deepEqual(await harness.snapshot(), {
    schemaExists: false,
    tableExists: false,
    ledgerRows: 0,
  });
});

test('rejects an owner-created catalog collision before callbacks', async () => {
  await harness.reset('schema_absent');
  await harness.setup.unsafe(`
    CREATE FUNCTION public.now() RETURNS timestamptz
    LANGUAGE sql VOLATILE AS 'SELECT pg_catalog.clock_timestamp()'
  `);
  const result = await harness.run({ failCallbackAt: 0 });
  assert.equal(result.outer.ok, true);
  assert.deepEqual(result.execution, {
    ok: false,
    error: { code: 'MIGRATION_EXECUTION_PUBLIC_SCHEMA_REJECTED' },
  });
  assert.deepEqual(await harness.snapshot(), {
    schemaExists: false,
    tableExists: false,
    ledgerRows: 0,
  });
});

test('allows an owner application object and runs both fixed inventory probes', async () => {
  await harness.reset('schema_absent');
  await harness.setup.unsafe('CREATE TABLE public.owner_application_marker (id integer)');
  const taggedQueries: string[] = [];
  const result = await harness.run({ taggedQueries });
  assert.equal(result.outer.ok, true);
  assert.equal(result.execution?.ok, true, JSON.stringify(result.execution));
  const probes = taggedQueries.filter(query => query.includes('foreign_owned(object_oid)'));
  assert.equal(probes.length, 2);
  const catalogs = [
    'pg_class',
    'pg_type',
    'pg_proc',
    'pg_operator',
    'pg_collation',
    'pg_conversion',
    'pg_opclass',
    'pg_opfamily',
    'pg_ts_config',
    'pg_ts_dict',
    'pg_ts_parser',
    'pg_ts_template',
  ];
  for (const catalog of catalogs)
    assert(probes.every(query => query.includes(`pg_catalog.${catalog}`)));
  assert.deepEqual(
    taggedQueries
      .filter(query => query.includes('SET LOCAL search_path'))
      .map(query => query.trim()),
    [
      'SET LOCAL search_path = pg_catalog, pg_temp',
      'SET LOCAL search_path = public, pg_temp',
      'SET LOCAL search_path = pg_catalog, pg_temp',
    ]
  );
});

test('post-commit unlock failure makes exactly one fixed unlock attempt', async () => {
  await harness.reset('schema_absent');
  const taggedQueries: string[] = [];
  const result = await harness.run({ failUnlock: true, taggedQueries });
  assert.deepEqual(result.execution, {
    ok: false,
    error: { code: 'MIGRATION_EXECUTION_CLEANUP_FAILED' },
  });
  assert.equal(taggedQueries.filter(query => query.includes('pg_advisory_unlock')).length, 1);
  assert.deepEqual(await harness.snapshot(), {
    schemaExists: true,
    tableExists: true,
    ledgerRows: 93,
  });
  const changed = await harness.run({ finalPid: -1 });
  assert(changed.execution && !changed.execution.ok);
  assert.equal(changed.execution.error.code, 'MIGRATION_EXECUTION_SESSION_CHANGED');
});
