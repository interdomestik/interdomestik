import assert from 'node:assert/strict';
import { count, eq, inArray, sql } from 'drizzle-orm';

import type { AgentMessageFixture } from '../agent-message-visibility.fixture';

import {
  type Cores,
  type Database,
  type EndableClient,
  ADMIN_FAMILY,
  DENIED_ROLES,
  LIST_KEYS,
  LIST_CLAIM_KEYS,
  WORKSPACE_KEYS,
} from './agent-claims-reader-contract';

const asRows = (result: unknown): Record<string, unknown>[] =>
  Array.from(result as Iterable<Record<string, unknown>>);
const keys = (value: object): string[] => Object.keys(value).sort();
const ids = (items: { id: string }[]): string[] => items.map(item => item.id);
const num = (result: { n: number | string }[]): number => Number(result[0]?.n ?? Number.NaN);

function at<T>(items: T[], index: number): T {
  const item = items[index];
  assert.ok(item, `missing item at ${index}`);
  return item;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function parseFixture(text: string): AgentMessageFixture {
  const parsed = JSON.parse(text) as AgentMessageFixture;
  assert.equal(parsed.claimIds.length, 105);
  assert.equal(parsed.deniedIds.length, 3);
  return parsed;
}

async function assertGucReset(db: Database['dbRls'], label: string): Promise<void> {
  const [row] = asRows(
    await db.execute(
      sql`select nullif(current_setting('app.current_tenant_id', true), '') as tenant, nullif(current_setting('app.current_access_tenant_id', true), '') as access, nullif(current_setting('app.user_role', true), '') as role`
    )
  );
  assert.deepEqual(row, { tenant: null, access: null, role: null }, `${label}: context leaked`);
}

async function readPosture(db: Database['dbRls']): Promise<{
  currentUserMatches: boolean;
  superuser: boolean;
  bypassRls: boolean;
}> {
  const expected = process.env.S8_EXPECT_ROLE ?? '';
  const [row] = asRows(
    await db.execute(
      sql`select current_user::text = ${expected} as "currentUserMatches", r.rolsuper as superuser, r.rolbypassrls as "bypassRls" from pg_roles r where r.rolname = current_user`
    )
  );
  const posture = {
    currentUserMatches: row?.currentUserMatches === true,
    superuser: row?.superuser !== false,
    bypassRls: row?.bypassRls !== false,
  };
  assert.deepEqual(posture, { currentUserMatches: true, superuser: false, bypassRls: false });
  return posture;
}

async function rawCounts(c: Cores): Promise<{ claims: number; messages: number }> {
  const { dbRls, claims, claimMessages } = c.database;
  return {
    claims: num(await dbRls.select({ n: count() }).from(claims)),
    messages: num(await dbRls.select({ n: count() }).from(claimMessages)),
  };
}

async function checkList(c: Cores, f: AgentMessageFixture, role: string): Promise<number> {
  const result = await c.list({
    tenantId: f.tenantId,
    userId: f.agentId,
    role,
    branchId: f.branchId,
  });
  if (!result.ok) throw new Error(`list reader denied for ${role}`);
  assert.equal(result.data.length, 1);
  const group = at(result.data, 0);
  assert.equal(group.memberId, f.memberId);
  assert.deepEqual(keys(group), LIST_KEYS);
  assert.deepEqual([...ids(group.claims)].sort(), [...f.claimIds].sort());
  for (const claim of group.claims) {
    assert.deepEqual(keys(claim), LIST_CLAIM_KEYS);
    assert.equal(claim.status, 'submitted');
    assert.equal(claim.statusLabelKey, 'claims-tracking.status.submitted');
  }
  return group.claims.length;
}

async function checkWorkspace(c: Cores, f: AgentMessageFixture, role: string): Promise<number> {
  const base = { tenantId: f.tenantId, userId: f.agentId, role };
  const initial = await c.workspace(base);
  if (!initial.ok) throw new Error(`workspace reader denied for ${role}`);
  assert.deepEqual(ids(initial.claims), f.claimIds.slice(0, 100));
  const first = at(initial.claims, 0);
  assert.deepEqual(keys(first), WORKSPACE_KEYS);
  assert.equal(first.lastMessage, 'S1 public agent reply');
  assert.equal(first.unreadCount, 1);
  assert.equal(first.policy, null);
  for (const index of [1, 2, 3]) {
    const other: (typeof initial.claims)[number] = at(initial.claims, index);
    assert.equal(other.lastMessage, null);
    assert.equal(other.unreadCount, 0);
  }

  const selectedId = at(f.claimIds, 104);
  const selected = await c.workspace({ ...base, selectedClaimId: ` ${selectedId} ` });
  if (!selected.ok) throw new Error(`workspace selection denied for ${role}`);
  assert.deepEqual(ids(selected.claims), [...f.claimIds.slice(0, 99), selectedId]);
  const last = at(selected.claims, 99);
  assert.equal(last.lastMessage, 'S1 selected public');
  assert.equal(last.unreadCount, 1);

  for (const deniedId of f.deniedIds) {
    const denied = await c.workspace({ ...base, selectedClaimId: deniedId });
    if (!denied.ok) throw new Error(`workspace denial probe rejected for ${role}`);
    assert.deepEqual(ids(denied.claims), f.claimIds.slice(0, 100));
  }
  assert.doesNotMatch(JSON.stringify([initial, selected]), /secret|unspecified visibility/);
  return initial.claims.length;
}

async function runFull(c: Cores, f: AgentMessageFixture): Promise<Record<string, number>> {
  const { dbRls, withTenantContext, claims } = c.database;
  const posture = await readPosture(dbRls);
  const baseline = await rawCounts(c);
  assert.deepEqual(baseline, { claims: 0, messages: 0 }, 'RLS not engaged outside context');

  for (const role of DENIED_ROLES) {
    const params = { tenantId: f.tenantId, userId: f.agentId, role: role as string };
    assert.deepEqual(await c.list(params), { ok: false, code: 'FORBIDDEN' });
    assert.deepEqual(await c.workspace(params), { ok: false, code: 'FORBIDDEN' });
  }

  const listClaims = await checkList(c, f, 'agent');
  const workspaceClaims = await checkWorkspace(c, f, 'agent');
  await assertGucReset(dbRls, 'after success');
  for (const role of ADMIN_FAMILY) {
    assert.equal(await checkList(c, f, role), 105);
    assert.equal(await checkWorkspace(c, f, role), 100);
  }
  await assertGucReset(dbRls, 'after admin family');

  const agent = { userId: f.agentId, role: 'agent' };
  assert.deepEqual(await c.list({ ...agent, tenantId: '' }), { ok: false, code: 'INTERNAL' });
  await assert.rejects(c.workspace({ ...agent, tenantId: '' }));
  await assert.rejects(c.workspace({ ...agent, tenantId: undefined as unknown as string }));
  // Context trims the tenant, but the exact identity predicate must still deny a missing agent.
  assert.deepEqual(await c.workspace({ ...agent, tenantId: ` ${f.tenantId} ` }), {
    ok: false,
    code: 'FORBIDDEN',
  });

  await assert.rejects(
    withTenantContext({ tenantId: f.tenantId, role: 'agent' }, async tx => {
      const [inside] = asRows(
        await tx.execute(sql`select current_setting('app.current_tenant_id', true) as tenant`)
      );
      assert.equal(inside?.tenant, f.tenantId);
      throw new Error('deliberate rollback');
    }),
    /deliberate rollback/
  );
  await assertGucReset(dbRls, 'after rollback');

  assert.deepEqual(await c.workspace({ ...agent, tenantId: f.foreignTenantId }), {
    ok: false,
    code: 'FORBIDDEN',
  });
  assert.deepEqual(await c.list({ ...agent, tenantId: f.foreignTenantId }), {
    ok: true,
    data: [],
  });
  assert.equal(await checkWorkspace(c, f, 'agent'), 100);
  await assertGucReset(dbRls, 'after other tenant');

  const foreignClaimId = at(f.deniedIds, 0);
  const inside = await withTenantContext({ tenantId: f.tenantId, role: 'agent' }, async tx => ({
    visible: num(
      await tx.select({ n: count() }).from(claims).where(inArray(claims.id, f.claimIds))
    ),
    foreign: num(await tx.select({ n: count() }).from(claims).where(eq(claims.id, foreignClaimId))),
  }));
  assert.ok(inside.visible > 0, 'wrapper context shows no fixture claims');
  assert.equal(inside.foreign, 0);
  assert.deepEqual(await rawCounts(c), { claims: 0, messages: 0 }, 'RLS leaked after wrapper');

  // Loaded only after the main entry pinned every URL and proved role readiness.
  const { runProfileNotesReader } = await import('./agent-profile-notes-restricted-reader');
  const profileNotes = await runProfileNotesReader(f, dbRls);

  return {
    listClaims,
    workspaceClaims,
    selectedClaims: 100,
    deniedSelections: f.deniedIds.length,
    deniedRoles: DENIED_ROLES.length,
    adminFamilyRoles: ADMIN_FAMILY.length,
    insideVisibleClaims: inside.visible,
    postureChecked: posture.currentUserMatches ? 1 : 0,
    ...profileNotes,
  };
}

async function runFailure(c: Cores, f: AgentMessageFixture): Promise<Record<string, number>> {
  const listClaims = await checkList(c, f, 'agent');
  // A real read failure must surface as a rejection, never as an empty workspace.
  await assert.rejects(c.workspace({ tenantId: f.tenantId, userId: f.agentId, role: 'agent' }));
  await assertGucReset(c.database.dbRls, 'after read failure');
  return { listClaims, workspaceRejected: 1 };
}

async function closeClients(): Promise<void> {
  const globals = globalThis as unknown as {
    queryClientAdmin?: EndableClient;
    queryClientRls?: EndableClient;
  };
  const clients = new Set<EndableClient>();
  for (const client of [globals.queryClientAdmin, globals.queryClientRls]) {
    if (client) clients.add(client);
  }
  await Promise.all([...clients].map(client => client.end({ timeout: 5 })));
}

async function main(): Promise<void> {
  const restricted = process.env.DATABASE_URL_RLS;
  if (!restricted) throw new Error('missing restricted connection');
  // Pin the environment before any database module is imported.
  process.env.DATABASE_URL = restricted;
  process.env.DATABASE_URL_RLS = restricted;
  process.env.DB_MAX_CONNECTIONS = '1';
  process.env.REQUIRE_RLS_INTEGRATION = '1';
  process.env.DB_RLS_ROLE = '';
  const mode = process.env.S8_READER_MODE === 'failure' ? 'failure' : 'full';
  const fixture = parseFixture(await readStdin());
  try {
    const database = await import('@interdomestik/database');
    const { assertRlsConnectionRoleReady } = await import('@interdomestik/database/db');
    await assertRlsConnectionRoleReady();
    const { getAgentClaimsCore } =
      await import('../../../src/app/[locale]/(agent)/agent/claims/_core');
    const { getAgentWorkspaceClaimsCore } =
      await import('../../../src/app/[locale]/(agent)/agent/workspace/claims/_core');
    const cores: Cores = {
      list: getAgentClaimsCore,
      workspace: getAgentWorkspaceClaimsCore,
      database,
    };
    const counts =
      mode === 'failure' ? await runFailure(cores, fixture) : await runFull(cores, fixture);
    const posture = await readPosture(database.dbRls);
    process.stdout.write(`S8_RESULT ${JSON.stringify({ ok: true, mode, counts, posture })}\n`);
  } finally {
    await closeClients();
  }
}

main().catch((error: unknown) => {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : 'non-error thrown';
  const location =
    error instanceof Error
      ? /agent-[\w-]+reader\.ts:\d+:\d+/.exec(error.stack ?? '')?.[0]
      : undefined;
  process.stderr.write(`S8_ERROR ${text.split('\n')[0].slice(0, 200)} ${location ?? ''}\n`);
  process.exitCode = 1;
});
