import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import type postgres from 'postgres';

import { mintTenantAuthority } from '../src/tenant-authority';
import { homeTenant } from './claim-correspondence.fixture';

export const ownBranch = 'wp12-branch-one';
export const foreignBranch = 'wp12-branch-two';

/** A session and its matching authority, as the register admission requires them. */
export function actor(
  id: string,
  role: string,
  accessTenantId = homeTenant,
  branchId: string | null = ownBranch
) {
  return {
    session: { user: { id, role, tenantId: homeTenant, branchId, accessTenantId } },
    authority: mintTenantAuthority({
      purpose: 'test',
      tenantId: homeTenant,
      accessTenantId,
      principal: { userId: id, role, branchId, agentId: null },
    }),
  };
}

export type Actor = ReturnType<typeof actor>;

/** Loads a domain-claims entry through the web app's resolution, as the runtime does. */
export function importDomain<T>(name: string): Promise<T> {
  const web = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
  return import(pathToFileURL(web.resolve(`@interdomestik/domain-claims${name}`)).href);
}

/**
 * Supplies the scratch database's guarded pools to the real package entry points for `run`:
 * the domain's tenant transactions then run on the restricted runtime connection.
 */
export async function withDomainPools<T>(
  admin: postgres.Sql,
  runtime: postgres.Sql,
  run: () => Promise<T>
) {
  const pools = globalThis as typeof globalThis & {
    queryClientAdmin?: typeof admin;
    queryClientRls?: typeof runtime;
  };
  const previous = {
    admin: pools.queryClientAdmin,
    runtime: pools.queryClientRls,
    role: process.env.DB_RLS_ROLE,
  };
  pools.queryClientAdmin = admin;
  pools.queryClientRls = runtime;
  delete process.env.DB_RLS_ROLE;
  try {
    return await run();
  } finally {
    pools.queryClientAdmin = previous.admin;
    pools.queryClientRls = previous.runtime;
    if (previous.role === undefined) delete process.env.DB_RLS_ROLE;
    else process.env.DB_RLS_ROLE = previous.role;
  }
}

/** Polls until connection `pending` waits on a lock held by connection `holder`. */
export async function waitUntilBlocked(
  admin: postgres.Sql,
  pending: () => Promise<number>,
  holder: number
) {
  const until = Date.now() + 4_000;
  // Polls every 20 ms until the pending connection waits on the holder (recursive, not a loop).
  const poll = async (): Promise<number> => {
    if (Date.now() >= until) {
      throw new Error(`Expected a connection to block on connection ${holder}`);
    }
    const pid = await pending();
    if (pid) {
      const [{ blocked }] = await admin<{ blocked: boolean }[]>`
        select ${holder} = any(pg_blocking_pids(${pid})) as blocked`;
      if (blocked) return pid;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
    return poll();
  };
  return poll();
}

/** The backend pid of the domain's runtime connection (its application name is fixed). */
export async function runtimePid(admin: postgres.Sql) {
  const [row] = await admin<{ pid: number }[]>`
    select pid from pg_stat_activity
    where application_name = 'wp12_register_runtime' and datname = current_database()`;
  return row?.pid ?? 0;
}
