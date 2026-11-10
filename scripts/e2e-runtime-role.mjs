#!/usr/bin/env node
// Provisions the restricted LOGIN runtime role the E2E web server connects as (Plan070 U2-a).
// Fixtures keep the admin URL; only the app's DATABASE_URL_RLS uses this role, so every
// tenant-scoped query in the gate runs under real RLS instead of a BYPASSRLS superuser.
// The password is derived from the admin credential and cluster, so every process that can reach
// the cluster as admin (gate, smoke, state setup, lanes on other databases) agrees on it without
// exporting a secret, and re-provisioning never rotates it under a running server.
import { createHmac } from 'node:crypto';
import postgres from 'postgres';

export const E2E_RUNTIME_ROLE = 'interdomestik_e2e_runtime';
// Probe suites pass a suffixed role so their adversarial catalog edits never touch the lane role.
const ROLE_PATTERN = /^interdomestik_e2e_runtime(?:_[a-z\d]{1,24})?$/u;
// Stable signed 64-bit key serializing role DDL across concurrent lanes on one database.
const ROLE_DDL_LOCK_KEY = 930802;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);
const ROLE_FLAGS = 'LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION';
// PG <16 lets only superusers name SUPERUSER/BYPASSRLS/REPLICATION in ALTER ROLE (Supabase's admin
// is not one); an existing role keeps them and assertRoleState fails closed if any is set.
const ALTER_ROLE_FLAGS = 'LOGIN NOINHERIT NOCREATEDB NOCREATEROLE';
const TENANT_GUCS = ['app.current_tenant_id', 'app.current_access_tenant_id', 'app.user_role'];

/** Errors whose message is safe to print: they never carry SQL text or credentials. */
export class RuntimeRoleError extends Error {}

function assertDriverAuthority(value, url, label) {
  const authority = value.slice(value.indexOf('://') + 3).split(/[?/]/)[0];
  const parts = authority.split('@');
  const host = parts.at(-1).split(':')[0];
  if (
    /[#\\\s]/u.test(value) ||
    parts.length > 2 ||
    !/^[a-z\d.-]+$/i.test(host) ||
    host.toLowerCase() !== url.hostname.toLowerCase()
  ) {
    throw new RuntimeRoleError(`${label} has an ambiguous database authority`);
  }
}

function parseLoopbackUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new RuntimeRoleError(`${label} is not a valid database URL`);
  }
  if (!/^postgres(?:ql)?:$/u.test(url.protocol)) {
    throw new RuntimeRoleError(`${label} must be postgres`);
  }
  assertDriverAuthority(value, url, label);
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new RuntimeRoleError(`${label} must target a loopback host`);
  }
  if (url.search) throw new RuntimeRoleError(`${label} must not carry connection options`);
  if (!/^\/[a-z][a-z\d_]{0,62}$/u.test(url.pathname)) {
    throw new RuntimeRoleError(`${label} must name a plain database`);
  }
  return url;
}

function databaseTarget(url) {
  return `loopback:${url.port || '5432'}${url.pathname}`;
}

function assertRoleName(role) {
  if (!ROLE_PATTERN.test(role)) throw new RuntimeRoleError('unsupported E2E runtime role name');
  return role;
}

/** Fails before any destructive preparation when the admin URL is not a loopback test DB. */
export function assertE2eRuntimeTarget(adminUrl) {
  parseLoopbackUrl(adminUrl, 'E2E admin database URL');
}

/** Returns the runtime URL: the configured override, or the derived per-cluster credential. */
export function resolveE2eRuntimeUrl(adminUrl, configuredRuntimeUrl, role = E2E_RUNTIME_ROLE) {
  assertRoleName(role);
  const admin = parseLoopbackUrl(adminUrl, 'E2E admin database URL');
  if (!configuredRuntimeUrl) {
    const runtime = new URL(admin);
    runtime.username = role;
    runtime.password = createHmac('sha256', decodeURIComponent(admin.password))
      // Roles are cluster-wide and every accepted host is loopback: key on the port alone, so
      // lanes using different loopback spellings for one cluster never rotate each other.
      .update(`${role}:v2:loopback:${admin.port || '5432'}`)
      .digest('hex');
    return runtime.toString();
  }
  const runtime = parseLoopbackUrl(configuredRuntimeUrl, 'E2E_SERVER_DATABASE_URL_RLS');
  if (decodeURIComponent(runtime.username) !== role) {
    throw new RuntimeRoleError(`E2E_SERVER_DATABASE_URL_RLS must connect as ${role}`);
  }
  if (!/^[\dA-Za-z_-]{16,}$/u.test(decodeURIComponent(runtime.password))) {
    throw new RuntimeRoleError('E2E_SERVER_DATABASE_URL_RLS needs a hex or base64url password');
  }
  if (databaseTarget(runtime) !== databaseTarget(admin)) {
    throw new RuntimeRoleError('E2E_SERVER_DATABASE_URL_RLS must target the admin URL database');
  }
  return runtime.toString();
}

function connect(url, applicationName) {
  // debug stays off even if PGDEBUG is set: driver debug output would carry the role DDL.
  return postgres(url, {
    max: 1,
    connect_timeout: 10,
    debug: false,
    onnotice: () => {},
    connection: { application_name: applicationName },
  });
}

async function provisionRole(sql, role, password) {
  await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(${ROLE_DDL_LOCK_KEY})`;
    const [existing] = await tx`select 1 from pg_roles where rolname = ${role}`;
    const command = existing
      ? `ALTER ROLE ${role} ${ALTER_ROLE_FLAGS}`
      : `CREATE ROLE ${role} ${ROLE_FLAGS}`;
    const [{ literal }] = await tx`select quote_literal(${password}) as literal`;
    await tx.unsafe(`${command} PASSWORD ${literal}`);
    const [{ db }] = await tx`select quote_ident(current_database()) as db`;
    await tx.unsafe(`GRANT CONNECT ON DATABASE ${db} TO ${role}`);
    await tx.unsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
    // Base tables get DML only; RLS decides rows. Views are readable only when they run with
    // the invoker's rights, so their base-table policies still apply.
    const relations = await tx`
      select quote_ident(c.relname) as name, c.relkind as kind
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and (c.relkind in ('r', 'p', 'S')
        or (c.relkind = 'v' and 'security_invoker=true' = any(coalesce(c.reloptions, '{}'))))
      order by c.relname`;
    const names = kinds =>
      relations.filter(r => kinds.includes(r.kind)).map(r => `public.${r.name}`);
    const grants = [
      ['SELECT, INSERT, UPDATE, DELETE ON TABLE', names(['r', 'p'])],
      ['USAGE, SELECT ON SEQUENCE', names(['S'])],
      ['SELECT ON TABLE', names(['v'])],
    ].filter(([, targets]) => targets.length > 0);
    await Promise.all(
      grants.map(([privileges, targets]) =>
        tx.unsafe(`GRANT ${privileges} ${targets.join(', ')} TO ${role}`)
      )
    );
  });
}

async function assertRoleState(sql, role) {
  const [state] = await sql`
    select rolsuper, rolbypassrls, rolinherit, rolcreatedb, rolcreaterole, rolreplication,
      rolcanlogin,
      (select count(*)::int from pg_auth_members m where m.member = r.oid) as memberships,
      (select count(*)::int from pg_class c where c.relowner = r.oid) +
        (select count(*)::int from pg_namespace s where s.nspowner = r.oid) +
        (select count(*)::int from pg_proc p where p.proowner = r.oid) +
        (select count(*)::int from pg_database d where d.datdba = r.oid) as owned,
      (select count(*)::int from pg_db_role_setting g where g.setrole = r.oid) as settings,
      has_schema_privilege(r.oid, 'public', 'CREATE') as "schemaCreate",
      has_database_privilege(r.oid, current_database(), 'CREATE') as "databaseCreate"
    from pg_roles r where rolname = ${role}`;
  const unsafe =
    !state ||
    state.rolsuper ||
    state.rolbypassrls ||
    state.rolinherit ||
    state.rolcreatedb ||
    state.rolcreaterole ||
    state.rolreplication ||
    !state.rolcanlogin ||
    state.memberships !== 0 ||
    state.owned !== 0 ||
    state.settings !== 0 ||
    state.schemaCreate ||
    state.databaseCreate;
  if (unsafe) throw new RuntimeRoleError(`${role} posture is not restricted`);
}

// Reviewed platform objects (local Supabase) that expose no application rows, pinned by owning
// extension, name and definition hash: graphql's schema-version functions touch only their own
// sequence; the pg_stat_statements views read only statement statistics. Any other extension
// member, or a changed definition, is scanned like every other object.
const REVIEWED_EXTENSION_OBJECTS = [
  'pg_graphql:graphql.get_schema_version:6466cb87659190ca13d1e4c27e7433f5',
  'pg_graphql:graphql.increment_schema_version:c3e3051da5fe4d96d1ba4f615432e54a',
  'pg_stat_statements:extensions.pg_stat_statements:661b00d2ddc8ad2a8196b0327b2f07da',
  'pg_stat_statements:extensions.pg_stat_statements_info:8f5de7048de1fca9f5a545d88d7c3968',
];

// Every relation or function the role can reach outside row security. Schema USAGE is not a
// boundary: an invoker view or function can reach objects in schemas the role cannot name.
async function findRowSecurityBypasses(sql, role) {
  const relations = await sql`
    select n.nspname || '.' || c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname !~ '^pg_toast'
      and not exists (select 1 from pg_depend d join pg_extension e on e.oid = d.refobjid
        where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
          and case when c.relkind = 'v' then e.extname || ':' || n.nspname || '.' || c.relname
            || ':' || md5(pg_get_viewdef(c.oid)) end = any(${REVIEWED_EXTENSION_OBJECTS}))
      and (
        (c.relkind in ('r', 'p') and not c.relrowsecurity and (n.nspname = 'public'
          or has_any_column_privilege(${role}, c.oid, 'SELECT, INSERT, UPDATE')
          or has_table_privilege(${role}, c.oid, 'DELETE')))
        or (c.relkind in ('r', 'p', 'v', 'm', 'f') and (
          has_table_privilege(${role}, c.oid, 'TRUNCATE, TRIGGER')
          or has_any_column_privilege(${role}, c.oid, 'REFERENCES')))
        or (c.relkind = 'm' and has_any_column_privilege(${role}, c.oid, 'SELECT'))
        or (c.relkind in ('v', 'f')
          and (c.relkind = 'f' or not 'security_invoker=true' = any(coalesce(c.reloptions, '{}')))
          and (has_any_column_privilege(${role}, c.oid, 'SELECT, INSERT, UPDATE')
            or has_table_privilege(${role}, c.oid, 'DELETE'))))`;
  const functions = await sql`
    select n.nspname || '.' || p.proname as name
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema')
      and not exists (select 1 from pg_depend d join pg_extension e on e.oid = d.refobjid
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
          and e.extname || ':' || n.nspname || '.' || p.proname || ':'
            || md5(pg_get_functiondef(p.oid)) = any(${REVIEWED_EXTENSION_OBJECTS}))
      and has_function_privilege(${role}, p.oid, 'EXECUTE')`;
  return [...relations, ...functions].map(row => row.name).sort((a, b) => a.localeCompare(b));
}

async function assertRolePosture(sql, role) {
  await assertRoleState(sql, role);
  const bypasses = await findRowSecurityBypasses(sql, role);
  if (bypasses.length > 0) {
    throw new RuntimeRoleError(`${role} can bypass row security on: ${bypasses.join(', ')}`);
  }
}

async function assertRuntimeSession(runtimeUrl, role) {
  const expectedDatabase = new URL(runtimeUrl).pathname.slice(1);
  const sql = connect(runtimeUrl, 'interdomestik_e2e_runtime_probe');
  try {
    // Database- and role-level defaults apply at login, so a preset tenant GUC is caught here.
    const [session] = await sql`
      select session_user as "sessionUser", current_user as "currentUser",
        current_database() as database, rolsuper, rolbypassrls,
        concat(current_setting(${TENANT_GUCS[0]}, true), current_setting(${TENANT_GUCS[1]}, true),
          current_setting(${TENANT_GUCS[2]}, true)) as preset
      from pg_roles where rolname = current_user`;
    const restricted =
      session?.sessionUser === role &&
      session.currentUser === role &&
      session.database === expectedDatabase &&
      !session.rolsuper &&
      !session.rolbypassrls &&
      session.preset === '';
    if (!restricted)
      throw new RuntimeRoleError('E2E runtime connection is not the restricted role');
  } finally {
    await sql.end({ timeout: 1 });
  }
}

// Advisory locks are per database, so lanes on sibling databases of one cluster can race on
// the cluster-wide role catalog. Retry only those catalog races; every other error is final.
const CATALOG_RACE_CODES = new Set(['42710', '23505', '40001', 'XX000']);
async function provisionRoleWithRetry(sql, role, password, attempt = 1) {
  try {
    return await provisionRole(sql, role, password);
  } catch (error) {
    if (attempt >= 5 || !CATALOG_RACE_CODES.has(error?.code)) throw error;
    await new Promise(resolve => setTimeout(resolve, 200 * attempt));
    return provisionRoleWithRetry(sql, role, password, attempt + 1);
  }
}

/** Creates or re-asserts the restricted role, then proves a fresh login reaches only it. */
export async function provisionE2eRuntimeRole({
  adminUrl,
  runtimeUrl,
  env = process.env,
  role = E2E_RUNTIME_ROLE,
}) {
  // withTenantContext would SET LOCAL ROLE to DB_RLS_ROLE, which this role cannot assume.
  if (env.DB_RLS_ROLE) {
    throw new RuntimeRoleError('DB_RLS_ROLE must be unset for the E2E runtime role');
  }
  const resolved = resolveE2eRuntimeUrl(adminUrl, runtimeUrl, role);
  const password = decodeURIComponent(new URL(resolved).password);
  const sql = connect(adminUrl, 'interdomestik_e2e_runtime_provision');
  try {
    await provisionRoleWithRetry(sql, role, password);
    await assertRolePosture(sql, role);
  } finally {
    await sql.end({ timeout: 1 });
  }
  await assertRuntimeSession(resolved, role);
  return resolved;
}

/** Prints only messages we authored; driver errors are reduced to their SQLSTATE. */
export function describeRuntimeRoleFailure(error) {
  if (error instanceof RuntimeRoleError) return error.message;
  const code = typeof error?.code === 'string' && /^[\dA-Z]{5}$/u.test(error.code);
  return `database error ${code ? error.code : 'unknown'}`;
}
