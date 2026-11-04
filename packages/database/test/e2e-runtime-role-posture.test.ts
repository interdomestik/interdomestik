import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import postgres from 'postgres';

// @ts-expect-error -- untyped root ESM script; the suite exercises its public contract.
import * as runtimeRole from '../../../scripts/e2e-runtime-role.mjs';

type ProvisionInput = { adminUrl: string; env: Record<string, string>; role: string };
const { provisionE2eRuntimeRole } = runtimeRole as {
  provisionE2eRuntimeRole(input: ProvisionInput): Promise<string>;
};

const suffix = randomBytes(6).toString('hex');
const ROLE = `interdomestik_e2e_runtime_p${suffix}`;
const DATABASE = `e2e_role_probe_${suffix}`;

// Each adversarial state must make provisioning fail closed; `undo` restores the baseline.
const BYPASSES: { name: string; setup: string; undo: string; message: RegExp }[] = [
  {
    name: 'a public table without row security',
    setup: 'create table public.open_rows(id int)',
    undo: 'drop table public.open_rows',
    message: /bypass row security on: public\.open_rows/u,
  },
  {
    name: 'a definer-rights view granted to the role',
    setup: `create view public.owner_view as select * from t1; grant select on owner_view to ${ROLE}`,
    undo: 'drop view public.owner_view',
    message: /bypass row security on: public\.owner_view/u,
  },
  {
    name: 'a column grant on a definer-rights view to PUBLIC',
    setup:
      'create view public.owner_view as select * from t1; grant select (tenant_id) on owner_view to public',
    undo: 'drop view public.owner_view',
    message: /bypass row security on: public\.owner_view/u,
  },
  {
    name: 'a definer-rights view granted only DELETE',
    setup: `create view public.owner_view as select * from t1; grant delete on owner_view to ${ROLE}`,
    undo: 'drop view public.owner_view',
    message: /bypass row security on: public\.owner_view/u,
  },
  {
    name: 'a column UPDATE grant on a definer-rights view',
    setup: `create view public.owner_view as select * from t1; grant update (tenant_id) on owner_view to ${ROLE}`,
    undo: 'drop view public.owner_view',
    message: /bypass row security on: public\.owner_view/u,
  },
  {
    name: 'a definer function in an unusable schema behind an invoker view',
    setup: `create schema hidden;
      create function hidden.peek() returns bigint language sql security definer as $$ select count(*) from public.t1 $$;
      create view public.peek_view with (security_invoker = true) as select hidden.peek();
      grant select on public.peek_view to ${ROLE}`,
    undo: 'drop schema hidden cascade',
    message: /bypass row security on: hidden\.peek/u,
  },
  {
    name: 'a table without row security in an unusable schema behind an invoker view',
    setup: `create schema hidden; create table hidden.raw(id int); grant select on hidden.raw to ${ROLE};
      create view public.raw_view with (security_invoker = true) as select * from hidden.raw;
      grant select on public.raw_view to ${ROLE}`,
    undo: 'drop schema hidden cascade',
    message: /bypass row security on: hidden\.raw/u,
  },
  {
    name: 'an extension member outside the reviewed objects',
    setup: 'create extension pg_stat_statements',
    undo: 'drop extension pg_stat_statements',
    message: /bypass row security on: public\.pg_stat_statements/u,
  },
  {
    name: 'a table without row security added to a reviewed extension',
    setup: `create schema extensions; create extension pg_stat_statements schema extensions;
      create table public.open_rows(id int);
      alter extension pg_stat_statements add table public.open_rows`,
    undo: 'drop extension pg_stat_statements; drop table if exists public.open_rows; drop schema extensions',
    message: /bypass row security on: .*public\.open_rows/u,
  },
  {
    name: 'a SECURITY DEFINER function added to a reviewed extension',
    setup: `create schema extensions; create extension pg_stat_statements schema extensions;
      create function public.peek() returns bigint language sql security definer as $$ select count(*) from t1 $$;
      alter extension pg_stat_statements add function public.peek()`,
    undo: 'drop extension pg_stat_statements; drop schema extensions',
    message: /bypass row security on: .*public\.peek/u,
  },
  {
    name: 'a materialized view',
    setup: `create materialized view public.snapshot as select * from t1; grant select on snapshot to ${ROLE}`,
    undo: 'drop materialized view public.snapshot',
    message: /bypass row security on: public\.snapshot/u,
  },
  {
    name: 'TRUNCATE on a protected table',
    setup: `grant truncate on t1 to ${ROLE}`,
    undo: `revoke truncate on t1 from ${ROLE}`,
    message: /bypass row security on: public\.t1/u,
  },
  {
    name: 'a column REFERENCES grant',
    setup: `grant references (id) on t1 to ${ROLE}`,
    undo: `revoke references (id) on t1 from ${ROLE}`,
    message: /bypass row security on: public\.t1/u,
  },
  {
    name: 'an executable SECURITY DEFINER function',
    setup:
      'create function public.peek() returns bigint language sql security definer as $$ select count(*) from t1 $$',
    undo: 'drop function public.peek()',
    message: /bypass row security on: public\.peek/u,
  },
  {
    name: 'a role membership',
    setup: `grant pg_read_all_data to ${ROLE}`,
    undo: `revoke pg_read_all_data from ${ROLE}`,
    message: /posture is not restricted/u,
  },
  {
    name: 'ownership of a protected table',
    setup: `alter table t1 owner to ${ROLE}`,
    undo: 'alter table t1 owner to current_user',
    message: /posture is not restricted/u,
  },
  {
    name: 'a role-level tenant GUC',
    setup: `alter role ${ROLE} set app.current_access_tenant_id = 'tenant_b'`,
    undo: `alter role ${ROLE} reset all`,
    message: /posture is not restricted/u,
  },
  {
    name: 'a database-level tenant GUC',
    setup: `alter database ${DATABASE} set app.current_access_tenant_id = 'tenant_b'`,
    undo: `alter database ${DATABASE} reset all`,
    message: /not the restricted role/u,
  },
  {
    name: 'CREATE on the public schema',
    setup: `grant create on schema public to ${ROLE}`,
    undo: `revoke create on schema public from ${ROLE}`,
    message: /posture is not restricted/u,
  },
];

test('the E2E runtime role fails closed on every row-security bypass', async t => {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) {
    if (process.env.REQUIRE_RLS_INTEGRATION === '1') assert.fail('DATABASE_URL is required.');
    t.skip('DATABASE_URL is required for the runtime role posture test');
    return;
  }
  const scratchUrl = Object.assign(new URL(adminUrl), { pathname: `/${DATABASE}` }).toString();
  const cluster = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await cluster.unsafe(`create database ${DATABASE}`);
  const admin = postgres(scratchUrl, { max: 1, onnotice: () => {} });
  const provision = () => provisionE2eRuntimeRole({ adminUrl: scratchUrl, env: {}, role: ROLE });
  try {
    await admin.unsafe(`
      create table public.t1(id int primary key, tenant_id text not null);
      alter table public.t1 enable row level security;
      create policy p on public.t1
        using (tenant_id = current_setting('app.current_access_tenant_id', true));
      insert into public.t1 values (1, 'tenant_a'), (2, 'tenant_b');`);

    const runtimeUrl = await provision();
    const runtime = postgres(runtimeUrl, { max: 1 });
    try {
      const [{ count }] = await runtime`select count(*)::int as count from t1`;
      assert.equal(count, 0, 'without a tenant context the role sees no rows');
    } finally {
      await runtime.end({ timeout: 1 });
    }
    assert.equal(await provision(), runtimeUrl, 'reprovisioning keeps the same credential');

    for (const bypass of BYPASSES) {
      await t.test(`rejects ${bypass.name}`, async () => {
        await admin.unsafe(bypass.setup);
        try {
          await assert.rejects(provision(), bypass.message);
        } finally {
          await admin.unsafe(bypass.undo);
        }
        await provision();
      });
    }
  } finally {
    await admin.end({ timeout: 1 });
    await cluster.unsafe(`drop database if exists ${DATABASE} with (force)`);
    await cluster.unsafe(`drop role if exists ${ROLE}`);
    await cluster.end({ timeout: 1 });
  }
});

// Lanes on sibling databases of one cluster share the cluster-wide role and must agree on it.
test('concurrent provisioning across sibling databases converges on one credential', async t => {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) {
    if (process.env.REQUIRE_RLS_INTEGRATION === '1') assert.fail('DATABASE_URL is required.');
    t.skip('DATABASE_URL is required for the runtime role concurrency test');
    return;
  }
  const role = `interdomestik_e2e_runtime_c${suffix}`;
  const databases = [0, 1, 2, 3].map(index => `e2e_role_race_${suffix}_${index}`);
  const cluster = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    for (const database of databases) await cluster.unsafe(`create database ${database}`);
    const urls = await Promise.all(
      databases.map(database =>
        provisionE2eRuntimeRole({
          adminUrl: Object.assign(new URL(adminUrl), { pathname: `/${database}` }).toString(),
          env: {},
          role,
        })
      )
    );
    const credentials = new Set(urls.map(url => new URL(url).password));
    assert.equal(credentials.size, 1, 'every lane derives the same cluster credential');
    for (const [index, url] of urls.entries()) {
      const runtime = postgres(url, { max: 1 });
      try {
        const [row] = await runtime`select current_user as role, current_database() as db`;
        assert.deepEqual({ ...row }, { role, db: databases[index] });
      } finally {
        await runtime.end({ timeout: 1 });
      }
    }
  } finally {
    for (const database of databases) {
      await cluster.unsafe(`drop database if exists ${database} with (force)`);
    }
    await cluster.unsafe(`drop role if exists ${role}`);
    await cluster.end({ timeout: 1 });
  }
});
