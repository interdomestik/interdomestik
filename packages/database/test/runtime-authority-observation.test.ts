import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import postgres from 'postgres';

import {
  observeRuntimeAuthority,
  type RuntimeAuthorityObservation,
} from '../src/runtime-authority-observation';

// U2-e against a real restricted LOGIN: the observation is taken on that LOGIN's own connection in
// one read-only transaction, then evaluated by the CD evaluator exactly as staging will be.
type Evaluation = { ok: boolean; failureCodes: string[] };
type Evaluate = (o: unknown, input: unknown) => Evaluation;
const EVALUATOR_MODULE: string = '../../../scripts/ci/runtime-attestation/evaluate.mjs';
const evaluate = async (o: unknown, input: unknown): Promise<Evaluation> =>
  ((await import(EVALUATOR_MODULE)) as { evaluateObservation: Evaluate }).evaluateObservation(
    o,
    input
  );

const required = process.env.REQUIRE_RLS_INTEGRATION === '1';
const suffix = randomBytes(6).toString('hex');
const LOGIN = `u2e_obs_${suffix}`;
const PEER = `u2e_peer_${suffix}`;
const DATABASE = `u2e_obs_${suffix}`;
const PASSWORD = randomBytes(18).toString('hex');
const REQUEST = { challenge: 'c'.repeat(43), commitSha: 'a'.repeat(40) };
const HASH = (n: number) => n.toString(16).padStart(64, '0');
const JOURNAL = [
  { tag: '0000_a', when: 1000, hash: HASH(1) },
  { tag: '0001_b', when: 2000, hash: HASH(2) },
];

type Client = ReturnType<typeof postgres>;
type Options = Parameters<typeof observeRuntimeAuthority>[1];
const observeOn = (sql: Client, options?: Options): Promise<RuntimeAuthorityObservation> =>
  sql.begin('isolation level repeatable read read only', tx =>
    observeRuntimeAuthority(text => tx.unsafe(text), options)
  ) as Promise<RuntimeAuthorityObservation>;

async function observeAs(url: string): Promise<RuntimeAuthorityObservation> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    return await observeOn(sql);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

const codes = async (o: RuntimeAuthorityObservation, allowed: string[] = [], marker = 'mk-u2e') =>
  (
    await evaluate(
      { ...o, ...REQUEST, configuredRole: null },
      {
        expectation: { loginRole: LOGIN, allowedReachableRoles: allowed, backendMarker: marker },
        journal: JOURNAL,
        request: REQUEST,
      }
    )
  ).failureCodes;

test('U2-e observes the real restricted LOGIN and refuses drifted authority', async t => {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) {
    if (required) assert.fail('DATABASE_URL is required.');
    t.skip('DATABASE_URL is required for the runtime authority observation test');
    return;
  }
  const cluster = postgres(adminUrl, { max: 1, onnotice: () => {} });
  const scratchUrl = Object.assign(new URL(adminUrl), { pathname: `/${DATABASE}` }).toString();
  const loginUrl = Object.assign(new URL(scratchUrl), {
    username: LOGIN,
    password: PASSWORD,
  }).toString();
  const scratch = postgres(scratchUrl, { max: 1, onnotice: () => {} });
  try {
    await cluster.unsafe(`CREATE DATABASE ${DATABASE}`);
    await cluster.unsafe(
      `CREATE ROLE ${LOGIN} LOGIN PASSWORD '${PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`
    );
    await cluster.unsafe(`CREATE ROLE ${PEER} NOLOGIN`);
    await scratch.unsafe(`REVOKE CREATE ON DATABASE ${DATABASE} FROM PUBLIC`);
    await scratch.unsafe(`GRANT CONNECT ON DATABASE ${DATABASE} TO ${LOGIN}`);

    await t.test(
      'the baseline LOGIN is observed exactly; marker and ledger are unprovisioned',
      async () => {
        const o = await observeAs(loginUrl);
        assert.equal(o.sessionUser, LOGIN);
        assert.equal(o.currentUser, LOGIN);
        assert.equal(o.login?.rolcanlogin, true);
        assert.deepEqual(o.memberships, []);
        assert.equal(o.ownedObjectCount, 0);
        assert.ok(!o.databasePrivileges.includes('CREATE'));
        assert.deepEqual([o.backendMarker, o.migrationLedger], [null, null]);
        assert.deepEqual(await codes(o), ['BACKEND_MARKER_UNAVAILABLE', 'LEDGER_UNREADABLE']);
      }
    );

    await t.test('an enrolled marker and the exact ledger make the receipt pass', async () => {
      await scratch.unsafe(`CREATE SCHEMA runtime_attestation;
        CREATE TABLE runtime_attestation.backend_marker(marker text NOT NULL);
        INSERT INTO runtime_attestation.backend_marker VALUES ('mk-u2e');
        GRANT USAGE ON SCHEMA runtime_attestation TO ${LOGIN};
        GRANT SELECT ON runtime_attestation.backend_marker TO ${LOGIN};
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY, hash text NOT NULL, created_at bigint);
        INSERT INTO drizzle.__drizzle_migrations(hash, created_at) VALUES ('${HASH(1)}', 1000), ('${HASH(2)}', 2000);
        GRANT USAGE ON SCHEMA drizzle TO ${LOGIN};
        GRANT SELECT ON drizzle.__drizzle_migrations TO ${LOGIN};`);
      const o = await observeAs(loginUrl);
      assert.equal(o.backendMarker, 'mk-u2e');
      assert.deepEqual(await codes(o), []);
      assert.deepEqual(await codes(o, [], 'mk-other'), ['BACKEND_MARKER_MISMATCH']);
      await scratch.unsafe(
        `INSERT INTO drizzle.__drizzle_migrations(hash, created_at) VALUES ('${HASH(3)}', 3000)`
      );
      assert.deepEqual(await codes(await observeAs(loginUrl)), ['LEDGER_MISMATCH']);
      await scratch.unsafe(`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 3000`);
      // A second marker row is ambiguous and reads as no marker.
      await scratch.unsafe(`INSERT INTO runtime_attestation.backend_marker VALUES ('mk-u2e')`);
      assert.deepEqual(await codes(await observeAs(loginUrl)), ['BACKEND_MARKER_UNAVAILABLE']);
      await scratch.unsafe(
        `DELETE FROM runtime_attestation.backend_marker; INSERT INTO runtime_attestation.backend_marker VALUES ('mk-u2e')`
      );
    });

    await t.test(
      'reachable roles, admin options, ownership and unsafe defaults are refused',
      async () => {
        await cluster.unsafe(`GRANT ${PEER} TO ${LOGIN}`);
        let o = await observeAs(loginUrl);
        assert.deepEqual(o.memberships, [{ member: LOGIN, role: PEER, adminOption: false }]);
        assert.deepEqual(await codes(o), ['REACHABLE_ROLE_UNEXPECTED']);
        assert.deepEqual(await codes(o, [PEER]), []);
        await scratch.unsafe(
          `CREATE TABLE public.u2e_owned(id int); ALTER TABLE public.u2e_owned OWNER TO ${PEER}`
        );
        assert.deepEqual(await codes(await observeAs(loginUrl), [PEER]), ['OWNS_OBJECTS']);
        await scratch.unsafe('DROP TABLE public.u2e_owned');
        await cluster.unsafe(
          `REVOKE ${PEER} FROM ${LOGIN}; GRANT ${PEER} TO ${LOGIN} WITH ADMIN OPTION`
        );
        assert.deepEqual(await codes(await observeAs(loginUrl), [PEER]), [
          'MEMBERSHIP_ADMIN_OPTION',
        ]);
        await cluster.unsafe(`REVOKE ${PEER} FROM ${LOGIN}`);
        await cluster.unsafe(`ALTER ROLE ${LOGIN} SET row_security = off`);
        o = await observeAs(loginUrl);
        assert.ok(o.roleSettings.includes('row_security=off'));
        assert.deepEqual(await codes(o), ['UNSAFE_ROLE_SETTING']);
        await cluster.unsafe(`ALTER ROLE ${LOGIN} RESET ALL`);
        // Database-specific defaults apply too: role-in-database and database-wide.
        for (const scope of [`ROLE ${LOGIN} IN DATABASE ${DATABASE}`, `DATABASE ${DATABASE}`]) {
          await cluster.unsafe(`ALTER ${scope} SET row_security = off`);
          o = await observeAs(loginUrl);
          assert.ok(o.effectiveSettings.includes('row_security=off'), scope);
          assert.deepEqual(o.roleSettings, ['row_security=off'], scope);
          assert.deepEqual(await codes(o), ['UNSAFE_ROLE_SETTING'], scope);
          await cluster.unsafe(`ALTER ${scope} RESET ALL`);
        }
        await scratch.unsafe(`GRANT CREATE ON DATABASE ${DATABASE} TO ${LOGIN}`);
        assert.deepEqual(await codes(await observeAs(loginUrl)), ['DANGEROUS_DATABASE_PRIVILEGE']);
        await scratch.unsafe(`REVOKE CREATE ON DATABASE ${DATABASE} FROM ${LOGIN}`);
        assert.deepEqual(await codes(await observeAs(loginUrl)), []);
      }
    );

    await t.test(
      'a schema without USAGE and a table without SELECT both read as unavailable',
      async () => {
        await scratch.unsafe(`REVOKE USAGE ON SCHEMA drizzle FROM ${LOGIN}`);
        let o = await observeAs(loginUrl);
        assert.deepEqual([o.migrationLedger, await codes(o)], [null, ['LEDGER_UNREADABLE']]);
        await scratch.unsafe(`GRANT USAGE ON SCHEMA drizzle TO ${LOGIN};
        REVOKE SELECT ON drizzle.__drizzle_migrations FROM ${LOGIN}`);
        o = await observeAs(loginUrl);
        assert.deepEqual([o.migrationLedger, await codes(o)], [null, ['LEDGER_UNREADABLE']]);
        await scratch.unsafe(`GRANT SELECT ON drizzle.__drizzle_migrations TO ${LOGIN}`);
      }
    );

    await t.test(
      'a blocked observation fails fast, rolls back and frees its connection',
      async () => {
        const pool = postgres(loginUrl, { max: 1, onnotice: () => {} });
        const holder = postgres(scratchUrl, { max: 1, onnotice: () => {} });
        let release = () => {};
        const released = new Promise<void>(resolve => (release = resolve));
        let locked = () => {};
        const isLocked = new Promise<void>(resolve => (locked = resolve));
        const holding = holder.begin(async tx => {
          await tx.unsafe('LOCK TABLE runtime_attestation.backend_marker IN ACCESS EXCLUSIVE MODE');
          locked();
          await released;
        });
        try {
          await isLocked;
          const started = Date.now();
          await assert.rejects(
            observeOn(pool),
            (error: { code?: string }) => error.code === '55P03'
          );
          assert.ok(Date.now() - started < 3000, 'the lock wait is bounded by the database');
          release();
          await holding;
          // The same single connection is reusable, and nothing was left open in a transaction.
          assert.deepEqual(await codes(await observeOn(pool)), []);
          const [open] = await holder`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE usename = ${LOGIN} AND state LIKE 'idle in transaction%'`;
          assert.equal(open.n, 0);
          // No statement starts after the deadline; the transaction rolls back.
          let tick = 0;
          await assert.rejects(
            observeOn(pool, { deadline: 3, now: () => tick++ }),
            /DEADLINE_EXCEEDED/u
          );
          assert.deepEqual(await codes(await observeOn(pool)), []);
          // A session-level change left on a pooled connection is seen as the effective value.
          await pool.unsafe('SET row_security = off');
          assert.deepEqual(await codes(await observeOn(pool)), ['UNSAFE_ROLE_SETTING']);
        } finally {
          release();
          await holding.catch(() => {});
          await Promise.all([pool.end({ timeout: 1 }), holder.end({ timeout: 1 })]);
        }
      }
    );

    await t.test('an observation queued for the pool past its deadline runs nothing', async () => {
      const pool = postgres(loginUrl, { max: 1, onnotice: () => {} });
      let release = () => {};
      const released = new Promise<void>(resolve => (release = resolve));
      let held = () => {};
      const isHeld = new Promise<void>(resolve => (held = resolve));
      // The only connection is checked out by a transaction that has already run a statement.
      const busy = pool.begin(async tx => {
        await tx`SELECT 1`;
        held();
        await released;
      });
      try {
        await isHeld;
        const statements: string[] = [];
        // Taken when the observation is requested, as the production wrapper does.
        const deadline = Date.now() + 100;
        const queued = pool.begin('isolation level repeatable read read only', tx =>
          observeRuntimeAuthority(
            text => {
              statements.push(text);
              return tx.unsafe(text);
            },
            { deadline }
          )
        );
        await new Promise(resolve => setTimeout(resolve, 300));
        release();
        await busy;
        await assert.rejects(queued, /DEADLINE_EXCEEDED/u);
        assert.deepEqual(statements, []);
        assert.deepEqual(await codes(await observeOn(pool)), []);
      } finally {
        release();
        await busy.catch(() => {});
        await pool.end({ timeout: 1 });
      }
    });

    await t.test('a different LOGIN is refused even when it has the same posture', async () => {
      // The admin connection stands in for a management credential that switched role.
      const o = await observeAs(scratchUrl);
      assert.ok((await codes(o)).includes('SESSION_USER_MISMATCH'));
    });
  } finally {
    await scratch.end({ timeout: 1 });
    await cluster.unsafe(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`).catch(() => {});
    await cluster.unsafe(`DROP ROLE IF EXISTS ${LOGIN}`).catch(() => {});
    await cluster.unsafe(`DROP ROLE IF EXISTS ${PEER}`).catch(() => {});
    await cluster.end({ timeout: 1 });
  }
});
