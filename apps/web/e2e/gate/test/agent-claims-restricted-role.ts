import {
  agentClients,
  branches,
  claimMessages,
  claims,
  dbAdmin,
  memberActivities,
  memberNotes,
  subscriptions,
  user,
  userNotificationPreferences,
} from '@interdomestik/database';
import { getTableName, sql, type SQL } from 'drizzle-orm';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { AgentMessageFixture } from '../agent-message-visibility.fixture';
export type ReaderMode = 'full' | 'failure';
export interface RestrictedReaderResult {
  ok: true;
  mode: ReaderMode;
  counts: Record<string, number>;
  posture: { currentUserMatches: boolean; superuser: boolean; bypassRls: boolean };
}
export interface RestrictedRolePosture {
  flags: Record<string, boolean>;
  ownedProtectedTables: number;
  memberships: number;
  tables: { table: string; rowSecurity: boolean; policies: string[] }[];
}
export interface RestrictedRoleHandle {
  posture: RestrictedRolePosture;
  runReader(fixture: AgentMessageFixture, mode: ReaderMode): Promise<RestrictedReaderResult>;
  setClaimMessagesSelect(granted: boolean): Promise<void>;
}
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];
const READER_RELATIVE = path.join('e2e', 'gate', 'test', 'agent-claims-restricted-reader.ts');
const CHILD_TIMEOUT_MS = 120_000;
// Stable signed 64-bit key serializing S8 test DDL that mutates shared catalog ACL rows.
const CATALOG_DDL_LOCK_KEY = 930801;
const PARENT_TABLES = [user, agentClients, claims, claimMessages, branches];
const CHILD_TABLES = [subscriptions, userNotificationPreferences, memberActivities, memberNotes];
const PROTECTED_TABLES = [...PARENT_TABLES, ...CHILD_TABLES].map(table => getTableName(table));
const MESSAGES_TABLE = getTableName(claimMessages);
const EXPECTED_FLAGS: Record<string, boolean> = {
  rolsuper: false,
  rolbypassrls: false,
  rolinherit: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolcanlogin: true,
};
function ident(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new Error('Unsafe SQL identifier');
  return '"' + value + '"';
}
async function rows(query: SQL): Promise<Record<string, unknown>[]> {
  const result = await dbAdmin.execute(query);
  return Array.from(result as unknown as Iterable<Record<string, unknown>>);
}
// All owned test DDL goes through here: a transaction-scoped advisory lock serializes
// concurrent catalog ACL mutations ("tuple concurrently updated") across parallel workers.
// The lock is released automatically on commit or rollback; reads stay outside it.
async function exec(text: string): Promise<void> {
  await dbAdmin.transaction(async tx => {
    await tx.execute(sql.raw(`select pg_advisory_xact_lock(${CATALOG_DDL_LOCK_KEY})`));
    await tx.execute(sql.raw(text));
  });
}
function pgCode(error: unknown): string {
  const code =
    (error as { cause?: { code?: unknown } }).cause?.code ?? (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : 'unknown';
}
function restrictedUrl(role: string, password: string): string {
  let url: URL;
  try {
    url = new URL(process.env.DATABASE_URL ?? '');
  } catch {
    throw new Error('DATABASE_URL must be a valid connection URL');
  }
  if (!LOOPBACK_HOSTS.includes(url.hostname)) {
    throw new Error('Restricted-role regression requires a loopback DATABASE_URL');
  }
  url.username = role;
  url.password = password;
  return url.toString();
}
async function assertSetupCanCreateRoles(): Promise<void> {
  const [capability] = await rows(
    sql`select (rolsuper or rolcreaterole) as ok from pg_roles where rolname = current_user`
  );
  if (capability?.ok !== true) {
    throw new Error(
      'Setup role cannot create roles; the loopback fixture database owner is required'
    );
  }
}
async function collectPosture(role: string): Promise<RestrictedRolePosture> {
  const [flagRow] = await rows(
    sql`select rolsuper, rolbypassrls, rolinherit, rolcreatedb, rolcreaterole, rolreplication, rolcanlogin from pg_roles where rolname = ${role}`
  );
  const tableList = sql.join(
    PROTECTED_TABLES.map(table => sql`${table}`),
    sql`, `
  );
  const tableRows = await rows(
    sql`select c.relname as "table", c.relrowsecurity as "rowSecurity", pg_get_userbyid(c.relowner) as owner from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in (${tableList}) order by c.relname`
  );
  const policyRows = await rows(
    sql`select tablename as "table", policyname as name from pg_policies where schemaname = 'public' and tablename in (${tableList}) order by tablename, policyname`
  );
  const [memberRow] = await rows(
    sql`select count(*)::int as n from pg_auth_members m join pg_roles r on r.oid = m.member where r.rolname = ${role}`
  );
  const flags: Record<string, boolean> = {};
  for (const [name, expected] of Object.entries(EXPECTED_FLAGS)) {
    flags[name] = flagRow?.[name] === true;
    if (flags[name] !== expected) throw new Error(`Restricted role flag mismatch: ${name}`);
  }
  if (tableRows.length !== PROTECTED_TABLES.length) {
    throw new Error('Protected table posture query did not return every protected table');
  }
  const tables = tableRows.map(row => {
    const table = String(row.table);
    const policies = policyRows.filter(p => p.table === table).map(p => String(p.name));
    if (row.rowSecurity !== true) throw new Error(`Row security disabled on ${table}`);
    if (policies.length === 0) throw new Error(`No RLS policy found on ${table}`);
    return { table, rowSecurity: true, policies };
  });
  const ownedProtectedTables = tableRows.filter(row => row.owner === role).length;
  if (ownedProtectedTables !== 0) throw new Error('Restricted role owns a protected table');
  const memberships = Number(memberRow?.n ?? NaN);
  if (memberships !== 0) throw new Error('Restricted role has role memberships');
  return { flags, ownedProtectedTables, memberships, tables };
}
function resolveWebRoot(): string {
  for (const candidate of [process.cwd(), path.join(process.cwd(), 'apps', 'web')]) {
    if (existsSync(path.join(candidate, READER_RELATIVE))) return path.resolve(candidate);
  }
  throw new Error('Unable to locate the apps/web worktree root for the restricted reader');
}
function resolveTsxCli(webRoot: string): string {
  for (const base of [webRoot, path.resolve(webRoot, '..', '..')]) {
    try {
      return createRequire(path.join(base, 'package.json')).resolve('tsx/cli');
    } catch {
      // try the next resolution base
    }
  }
  throw new Error('Unable to resolve the installed tsx cli');
}
function childEnv(url: string, role: string, mode: ReaderMode): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG']) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return {
    ...env,
    NODE_ENV: 'test',
    DATABASE_URL: url,
    DATABASE_URL_RLS: url,
    DB_MAX_CONNECTIONS: '1',
    REQUIRE_RLS_INTEGRATION: '1',
    DB_RLS_ROLE: '',
    S8_EXPECT_ROLE: role,
    S8_READER_MODE: mode,
  };
}
function sanitize(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) if (secret) out = out.split(secret).join('[redacted]');
  return out.replace(/postgres(?:ql)?:[^\s]+/gi, '[redacted-url]').slice(0, 400);
}
function runReaderChild(
  fixture: AgentMessageFixture,
  mode: ReaderMode,
  url: string,
  role: string,
  password: string
): Promise<RestrictedReaderResult> {
  const webRoot = resolveWebRoot();
  const args = [
    resolveTsxCli(webRoot),
    '--tsconfig',
    path.join(webRoot, 'tsconfig.json'),
    path.join(webRoot, READER_RELATIVE),
  ];
  const secrets = [password, url];
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      args,
      {
        cwd: webRoot,
        env: childEnv(url, role, mode),
        timeout: CHILD_TIMEOUT_MS,
        killSignal: 'SIGKILL',
        maxBuffer: 1024 * 1024,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error) {
          const diagnostic = stderr.split('\n').find(line => line.startsWith('S8_ERROR')) ?? '';
          const reason = error.killed ? 'timeout' : `exit ${String(error.code ?? 'unknown')}`;
          reject(
            new Error(
              `Restricted reader (${mode}) failed: ${reason}. ${sanitize(diagnostic, secrets)}`
            )
          );
          return;
        }
        const line = stdout.split('\n').find(entry => entry.startsWith('S8_RESULT '));
        try {
          const parsed = JSON.parse(
            (line ?? '').slice('S8_RESULT '.length)
          ) as RestrictedReaderResult;
          if (parsed.ok !== true || parsed.mode !== mode) throw new Error('unexpected result');
          resolve(parsed);
        } catch {
          reject(new Error(`Restricted reader (${mode}) produced no valid result line`));
        }
      }
    );
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(JSON.stringify(fixture));
  });
}
export async function withRestrictedAgentClaimsRole<T>(
  action: (handle: RestrictedRoleHandle) => Promise<T>
): Promise<T> {
  const roleName = `s8_rls_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const password = randomBytes(24).toString('hex');
  if (!/^[0-9a-f]{48}$/.test(password)) throw new Error('Unexpected generated credential shape');
  const role = ident(roleName);
  const url = restrictedUrl(roleName, password);
  await assertSetupCanCreateRoles();
  try {
    await exec(
      `create role ${role} login password '${password}' nosuperuser nobypassrls noinherit nocreatedb nocreaterole noreplication connection limit 3`
    );
  } catch (error) {
    // The driver error text embeds the statement; never forward it.
    throw new Error(`Restricted role creation failed (${pgCode(error)})`);
  }
  let outcome: { value: T } | { error: unknown };
  try {
    await exec(`grant usage on schema public to ${role}`);
    for (const table of PROTECTED_TABLES) {
      await exec(`grant select on table public.${ident(table)} to ${role}`);
    }
    const posture = await collectPosture(roleName);
    const value = await action({
      posture,
      runReader: (fixture, mode) => runReaderChild(fixture, mode, url, roleName, password),
      setClaimMessagesSelect: async granted => {
        const table = `public.${ident(MESSAGES_TABLE)}`;
        await exec(
          granted
            ? `grant select on table ${table} to ${role}`
            : `revoke select on table ${table} from ${role}`
        );
      },
    });
    outcome = { value };
  } catch (error) {
    outcome = { error };
  }
  // Attempt both cleanup statements even if the first throws; record sanitized codes only.
  const cleanupCodes: string[] = [];
  for (const statement of [`drop owned by ${role}`, `drop role if exists ${role}`]) {
    try {
      await exec(statement);
    } catch (error) {
      cleanupCodes.push(pgCode(error));
    }
  }
  const cleanupMessage = `Restricted role cleanup failed (${cleanupCodes.join(',')})`;
  if ('error' in outcome) {
    // The original action failure stays primary; cleanup diagnostics are code-only.
    if (cleanupCodes.length > 0) console.warn(cleanupMessage);
    throw outcome.error;
  }
  if (cleanupCodes.length > 0) throw new Error(cleanupMessage);
  return outcome.value;
}
