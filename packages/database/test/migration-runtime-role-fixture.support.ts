import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';

import { buildCanonicalMigrationCallbackPlan } from '../src/migration-callback-plan';
import type { MigrationExecutionResult } from '../src/migration-execution-contracts';
import { executeMigrationKernel } from '../src/migration-execution-kernel';
import { authenticCorpus } from './migration-callback.support';
import { withRuntimeRoleContainer } from './migration-runtime-role-lifecycle.support';
import { inspectRuntimeRoleManifest } from './migration-runtime-role-manifest.support';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const safeName = (prefix: string, suffix: string) => `${prefix}_${suffix}`;
async function connect(url: string, applicationName: string, signal: AbortSignal) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (signal.aborted) throw new Error('MIGRATION_RUNTIME_ROLE_ABORTED');
    // prettier-ignore
    const sql=postgres(url,{max:1,connect_timeout:5,onnotice:()=>{},connection:{application_name:applicationName}});
    try {
      await sql`SELECT 1`;
      await delay(100);
      await sql`SELECT 1`;
      return sql;
    } catch {
      await sql.end({ timeout: 0 }).catch(() => {});
      await delay(100);
    }
  }
  throw new Error('MIGRATION_RUNTIME_ROLE_CONNECT_FAILED');
}
function authority(port: number) {
  // prettier-ignore
  const base={environmentClass:'local_scratch' as const,endpointSha256:sha256(`127.0.0.1:${port}`),caSha256:sha256(''),expectedRolsuper:false as const,expectedRolbypassrls:false as const};
  return Object.freeze({ ...base, receiptSha256: sha256(JSON.stringify(base)) });
}
export async function runMigrationRuntimeRoleFixture(signal: AbortSignal) {
  if (process.env.IDA_PG16_FIXTURE !== '1')
    throw new Error('MIGRATION_RUNTIME_ROLE_OPT_IN_REQUIRED');
  const plan = await buildCanonicalMigrationCallbackPlan(await authenticCorpus());
  if (!plan.ok) throw new Error('MIGRATION_RUNTIME_ROLE_PLAN_REJECTED');
  if (signal.aborted) throw new Error('MIGRATION_RUNTIME_ROLE_ABORTED');
  const lifecycle = await withRuntimeRoleContainer(signal, async port => {
    const suffix = randomBytes(6).toString('hex');
    const database = safeName('interdomestik_admin_config_p0a2a', suffix);
    const owner = safeName('p0a2a_owner', suffix);
    const runtime = 'interdomestik_runtime_rls';
    const password = randomBytes(18).toString('hex');
    const rootUrl = `postgres://postgres:${password}@127.0.0.1:${port}/postgres`;
    const control = await connect(rootUrl, 'interdomestik_p0a2a_control_v1', signal);
    const bootstrapPids: number[] = [];
    try {
      const [{ pid, major }] = await control<{ pid: number; major: number }[]>`
        SELECT pg_backend_pid()::int AS pid, current_setting('server_version_num')::int / 10000 AS major
      `;
      if (!pid || major !== 16) throw new Error('MIGRATION_RUNTIME_ROLE_VERSION_REJECTED');
      bootstrapPids.push(pid);
      if (signal.aborted) throw new Error('MIGRATION_RUNTIME_ROLE_ABORTED');
      for (const role of [owner, runtime])
        await control.unsafe(
          `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOREPLICATION NOCREATEDB NOCREATEROLE NOINHERIT`
        );
      await control.unsafe(`CREATE DATABASE ${database} OWNER ${owner}`);
    } finally {
      await control.end({ timeout: 1 });
    }
    const rootTargetUrl = `postgres://postgres:${password}@127.0.0.1:${port}/${database}`;
    const target = await connect(rootTargetUrl, 'interdomestik_p0a2a_target_v1', signal);
    try {
      const [{ pid, major }] = await target<{ pid: number; major: number }[]>`
        SELECT pg_backend_pid()::int AS pid, current_setting('server_version_num')::int / 10000 AS major
      `;
      if (!pid || major !== 16) throw new Error('MIGRATION_RUNTIME_ROLE_VERSION_REJECTED');
      bootstrapPids.push(pid);
      if (signal.aborted) throw new Error('MIGRATION_RUNTIME_ROLE_ABORTED');
      await target.unsafe('DROP SCHEMA public CASCADE');
      await target.unsafe(`CREATE SCHEMA public AUTHORIZATION ${owner}`);
      await target.unsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      await target.unsafe(`REVOKE CREATE ON SCHEMA public FROM ${runtime}`);
    } finally {
      await target.end({ timeout: 1 });
    }
    const urlFor = (role: string) => `postgres://${role}:${password}@127.0.0.1:${port}/${database}`;
    const envFor = (role: string) =>
      Object.freeze({ DATABASE_URL: urlFor(role), NODE_ENV: 'test', ADMIN_DB_LOCAL_SCRATCH: '1' });
    const { withPreflightedAdminConnection } = await import('../src/admin-connection-preflight');
    const ownerPids: number[] = [];
    const runOwner = async (): Promise<MigrationExecutionResult> => {
      let execution: MigrationExecutionResult | undefined;
      const outer = await withPreflightedAdminConnection(
        envFor(owner),
        Date.now(),
        signal,
        authority(port),
        async (sql, sameSignal) => {
          const [{ pid }] = await sql<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`;
          if (pid) ownerPids.push(pid);
          execution = await executeMigrationKernel(plan.capability, sql, sameSignal);
        }
      );
      if (!outer.ok || !execution) throw new Error('MIGRATION_RUNTIME_ROLE_OWNER_REJECTED');
      return execution;
    };
    const first = await runOwner();
    const second = await runOwner();
    let runtimeCallbackCount = 0;
    const rejected = await withPreflightedAdminConnection(
      envFor(runtime),
      Date.now(),
      signal,
      authority(port),
      async () => {
        runtimeCallbackCount += 1;
      }
    );
    const runtimePreflightCode = rejected.ok ? 'NO_ERROR' : rejected.error.code;
    const inspected = await inspectRuntimeRoleManifest(urlFor(owner), owner, runtime, signal);
    const verifier = await connect(rootTargetUrl, 'interdomestik_p0a2a_verifier_v1', signal);
    let sessionsAbsent = false;
    try {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (signal.aborted) throw new Error('MIGRATION_RUNTIME_ROLE_ABORTED');
        const sessions = await verifier<{ count: number }[]>`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE pid = ANY(${verifier.array([...bootstrapPids, ...ownerPids, inspected.closedPid])}::int[])
             OR application_name = 'interdomestik_admin_config_v1'
        `;
        if (sessions[0]?.count === 0) {
          sessionsAbsent = true;
          break;
        }
        if (attempt === 39) throw new Error('MIGRATION_RUNTIME_ROLE_SESSION_RETAINED');
        await delay(50);
      }
    } finally {
      await verifier.end({ timeout: 1 });
    }
    // prettier-ignore
    return {first,second,runtimePreflightCode,runtimeCallbackCount,manifest:inspected.manifest,cleanup:{bootstrap_sessions_absent:sessionsAbsent,owner_sessions_absent:sessionsAbsent,rejected_runtime_sessions_absent:sessionsAbsent}};
  });
  // prettier-ignore
  return Object.freeze({ ...lifecycle.value, cleanup: Object.freeze({ ...lifecycle.value.cleanup, ...lifecycle.cleanup }) });
}
