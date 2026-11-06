import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import postgres from 'postgres';

// U2-e staging enrolment (scripts/ci/runtime-attestation/enrol-core.mjs) against a real PostgreSQL:
// each case builds its own scratch database and runs the actual transaction, so refusals, rollback,
// the exact privilege matrix and the restricted login's own read are executed, not simulated.

type Sql = postgres.Sql<Record<string, unknown>>;
type Inputs = { role: string; marker: string };
type Enrolled = {
  transaction: string;
  code: string | null;
  path?: string;
  privileges?: Record<string, unknown>;
};
type Core = {
  EXPECTED_MATRIX: Record<string, unknown>;
  enrolStaging(admin: unknown, inputs: Inputs): Promise<Enrolled>;
  readBack(
    client: Sql,
    inputs: Inputs
  ): Promise<{ readback: string; code: string | null; ledgerCount?: number }>;
};
// Untyped root ESM; a non-literal specifier keeps the package type-check from resolving it.
const ENROL_MODULE: string = '../../../scripts/ci/runtime-attestation/enrol-core.mjs';

const required = process.env.REQUIRE_RLS_INTEGRATION === '1';
const suffix = randomBytes(6).toString('hex');
const ROLE = `ida_enrol_rt_${suffix}`;
const OTHER = `ida_enrol_other_${suffix}`;
const PASSWORD = randomBytes(18).toString('hex');
const MARKER = 'ida.staging.backend-marker.v1:d7295845-00f1-4cfb-a578-54d0891f06ee';
const OTHER_MARKER = 'ida.staging.backend-marker.v1:11111111-2222-4333-8444-555555555555';
const INPUTS = { role: ROLE, marker: MARKER };
const QUIET = { max: 1, onnotice: () => {} };
let scratchCount = 0;

function urlFor(base: string, database: string, user?: string): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  if (user) {
    url.username = user;
    url.password = PASSWORD;
  }
  return url.toString();
}

type Scratch = { admin: Sql; restricted: Sql; database: string };

async function withScratch(adminUrl: string, cluster: Sql, run: (s: Scratch) => Promise<void>) {
  scratchCount += 1;
  const database = `ida_enrol_${suffix}_${scratchCount}`;
  await cluster.unsafe(`create database ${database}`);
  const admin = postgres(urlFor(adminUrl, database), QUIET);
  const restricted = postgres(urlFor(adminUrl, database, ROLE), QUIET);
  try {
    await admin.unsafe(`create schema drizzle;
      create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint);
      insert into drizzle.__drizzle_migrations (hash, created_at) values ('h1', 1), ('h2', 2), ('h3', 3)`);
    await run({ admin, restricted, database });
  } finally {
    await Promise.allSettled([admin.end(), restricted.end()]);
    await cluster.unsafe(`drop database if exists ${database} with (force)`);
  }
}

/** An admin whose commit acknowledgement is lost after the enrolment body has finished. */
function losingCommitAck(admin: Sql) {
  const lose = async (body: (tx: unknown) => Promise<unknown>, tx: unknown): Promise<never> => {
    await body(tx);
    throw new Error('connection lost after the body');
  };
  return { begin: (body: (tx: unknown) => Promise<unknown>) => admin.begin(tx => lose(body, tx)) };
}

const markerAbsent = async (admin: Sql): Promise<boolean> =>
  (
    await admin`select count(*)::int as n from pg_namespace where nspname = 'runtime_attestation'`
  )[0].n === 0;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const ledgerUsage = async (admin: Sql): Promise<boolean> =>
  (await admin`select has_schema_privilege(${ROLE}::name, 'drizzle', 'USAGE') as u`)[0].u === true;

test('U2-e staging enrolment on a real PostgreSQL', async t => {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) {
    if (required) assert.fail('DATABASE_URL is required.');
    t.skip('DATABASE_URL is required for the staging enrolment integration test');
    return;
  }
  const core = (await import(ENROL_MODULE)) as Core;
  const cluster = postgres(adminUrl, QUIET);
  await cluster.unsafe(`create role ${ROLE} login noinherit password '${PASSWORD}'`);
  await cluster.unsafe(`create role ${OTHER} nologin`);
  const scratch = (run: (s: Scratch) => Promise<void>) => withScratch(adminUrl, cluster, run);
  const refused = async (admin: Sql, code: string, inputs: Inputs = INPUTS) => {
    const result = await core.enrolStaging(admin, inputs);
    assert.deepEqual([result.transaction, result.code], ['not_committed', code]);
  };

  try {
    await t.test('first application grants exactly the two reads; a rerun verifies', () =>
      scratch(async ({ admin, restricted }) => {
        const before = await admin`select * from drizzle.__drizzle_migrations order by id`;
        const result = await core.enrolStaging(admin, INPUTS);
        assert.deepEqual(
          [result.transaction, result.path, result.code],
          ['committed', 'created', null]
        );
        assert.deepEqual(result.privileges, core.EXPECTED_MATRIX);
        const read = await core.readBack(restricted, INPUTS);
        assert.deepEqual([read.readback, read.ledgerCount], ['ok', 3]);
        const denied = /permission denied/u;
        await assert.rejects(
          restricted`insert into runtime_attestation.backend_marker values ('x')`,
          denied
        );
        await assert.rejects(restricted`delete from drizzle.__drizzle_migrations`, denied);
        await assert.rejects(
          restricted`select nextval('drizzle.__drizzle_migrations_id_seq')`,
          denied
        );
        assert.deepEqual(
          await admin`select * from drizzle.__drizzle_migrations order by id`,
          before
        );
        const rerun = await core.enrolStaging(admin, INPUTS);
        assert.deepEqual([rerun.transaction, rerun.path], ['committed', 'verified']);
      })
    );

    await t.test('an existing marker in any other state is refused, never repaired', async () => {
      await scratch(async ({ admin }) => {
        assert.equal(
          (await core.enrolStaging(admin, { role: ROLE, marker: OTHER_MARKER })).transaction,
          'committed'
        );
        await refused(admin, 'MARKER_SHAPE_MISMATCH');
        const [row] = await admin`select marker from runtime_attestation.backend_marker`;
        assert.equal(row.marker, OTHER_MARKER);
      });
      await scratch(async ({ admin }) => {
        await core.enrolStaging(admin, INPUTS);
        await admin`delete from runtime_attestation.backend_marker`;
        await refused(admin, 'MARKER_EMPTY');
      });
      await scratch(async ({ admin }) => {
        await core.enrolStaging(admin, INPUTS);
        await admin.unsafe(
          `create function runtime_attestation.f() returns int language sql as 'select 1'`
        );
        await refused(admin, 'MARKER_SHAPE_MISMATCH');
      });
    });

    await t.test('an over-privileged runtime role is refused before any change', async () => {
      for (const [setup, undo, code] of [
        [
          `grant pg_read_all_data to ${ROLE}`,
          `revoke pg_read_all_data from ${ROLE}`,
          'ROLE_HAS_MEMBERSHIPS',
        ],
        [`alter role ${ROLE} createdb`, `alter role ${ROLE} nocreatedb`, 'ROLE_PRIVILEGED'],
      ]) {
        await cluster.unsafe(setup);
        try {
          await scratch(async ({ admin }) => {
            await refused(admin, code);
            assert.equal(await markerAbsent(admin), true);
          });
        } finally {
          await cluster.unsafe(undo);
        }
      }
    });

    await t.test('pre-existing extra access fails the postconditions and rolls back', async () => {
      const [{ v }] = await cluster`select current_setting('server_version_num')::int as v`;
      const maintain =
        v >= 170000
          ? [
              `grant maintain on drizzle.__drizzle_migrations to ${ROLE}`,
              `create table drizzle.m(id int); grant maintain on drizzle.m to ${ROLE}`,
            ]
          : [];
      for (const setup of [
        ...maintain,
        `grant usage on schema drizzle to ${ROLE} with grant option`,
        `grant select (hash) on drizzle.__drizzle_migrations to ${ROLE} with grant option`,
        `grant select (hash) on drizzle.__drizzle_migrations to public`,
        `grant insert (hash) on drizzle.__drizzle_migrations to ${ROLE}`,
        `grant usage on schema drizzle to ${ROLE}; grant usage on sequence drizzle.__drizzle_migrations_id_seq to ${ROLE}`,
        `create table drizzle.other(id int); grant select on drizzle.other to ${ROLE}`,
      ]) {
        await scratch(async ({ admin }) => {
          await admin.unsafe(setup);
          const usageBefore = await ledgerUsage(admin);
          await refused(admin, 'PRIVILEGE_MATRIX_UNEXPECTED');
          assert.equal(await markerAbsent(admin), true);
          assert.equal(await ledgerUsage(admin), usageBefore);
        });
      }
    });

    await t.test(
      'creator defaults are normalized for the role; other grantees roll back',
      async () => {
        await scratch(async ({ admin, restricted }) => {
          await admin.unsafe(`alter default privileges grant insert, update on tables to ${ROLE}`);
          assert.equal((await core.enrolStaging(admin, INPUTS)).transaction, 'committed');
          await assert.rejects(
            restricted`insert into runtime_attestation.backend_marker values ('x')`,
            /permission denied/u
          );
        });
        for (const grant of ['select on tables', 'usage on schemas']) {
          await scratch(async ({ admin }) => {
            await admin.unsafe(`alter default privileges grant ${grant} to ${OTHER}`);
            await refused(admin, 'MARKER_ACL_UNEXPECTED');
            assert.equal(await markerAbsent(admin), true);
          });
        }
      }
    );

    await t.test('a ledger change committed while enrolment waits for its lock is refused', () =>
      scratch(async ({ admin, database }) => {
        const other = postgres(urlFor(adminUrl, database), QUIET);
        const ddl = await other.reserve();
        try {
          await ddl`begin`;
          await ddl.unsafe('alter table drizzle.__drizzle_migrations add column extra int');
          const pending = core.enrolStaging(admin, INPUTS);
          const waiting = async () =>
            (
              await cluster`select count(*)::int as n from pg_stat_activity
                where datname = ${database} and wait_event_type = 'Lock'`
            )[0].n;
          for (let tries = 0; (await waiting()) === 0 && tries < 100; tries += 1) await pause(20);
          await ddl`commit`;
          const result = await pending;
          assert.deepEqual(
            [result.transaction, result.code],
            ['not_committed', 'LEDGER_SHAPE_MISMATCH']
          );
          assert.equal(await markerAbsent(admin), true);
        } finally {
          ddl.release();
          await other.end();
        }
      })
    );

    await t.test('a missing or replaced ledger is refused', async () => {
      await scratch(async ({ admin }) => {
        await admin.unsafe('drop schema drizzle cascade');
        await refused(admin, 'LEDGER_MISSING');
      });
      await scratch(async ({ admin }) => {
        await admin.unsafe(`alter table drizzle.__drizzle_migrations add column extra int`);
        await refused(admin, 'LEDGER_SHAPE_MISMATCH');
      });
    });

    await t.test('readback and commit outcomes are reported separately', () =>
      scratch(async ({ admin }) => {
        assert.equal((await core.enrolStaging(admin, INPUTS)).transaction, 'committed');
        const read = await core.readBack(admin, INPUTS);
        assert.deepEqual([read.readback, read.code], ['failed', 'READBACK_IDENTITY_MISMATCH']);
        const unknown = await core.enrolStaging(losingCommitAck(admin), INPUTS);
        assert.deepEqual(
          [unknown.transaction, unknown.code],
          ['commit_unknown', 'COMMIT_UNACKNOWLEDGED']
        );
      })
    );

    await t.test('invalid inputs are refused without touching the database', async () => {
      await refused(cluster, 'ROLE_NAME_INVALID', { role: 'Bad-Role', marker: MARKER });
      await refused(cluster, 'MARKER_INVALID', { role: ROLE, marker: "x'; drop table y; --" });
    });
  } finally {
    await cluster.unsafe(`drop role if exists ${ROLE}`);
    await cluster.unsafe(`drop role if exists ${OTHER}`);
    await cluster.end();
  }
});
