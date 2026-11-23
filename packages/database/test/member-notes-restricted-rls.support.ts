import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { inArray, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { agentClients, memberNotes, user } from '../src/schema';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import { grantRlsTestRole } from './rls-test-grants';
import { KS_TENANT_ID, MK_TENANT_ID } from './s8-claim-restricted-rls.fixture';

// Seed, grants and race helpers for member-notes-restricted-rls.test.ts. Every id is unique per
// run, and cleanup deletes by id, so a failed or partial run leaves nothing behind.

type AdminDb = ReturnType<typeof drizzle>;

export const NOTE_TABLES = ['member_notes', 'user', 'agent_clients'] as const;

/**
 * The runtime role's privileges on the three tables. Row locks (FOR SHARE, FOR UPDATE) need
 * UPDATE privilege in PostgreSQL, so the role gets UPDATE on `user` and `agent_clients` too; the
 * commands never write either table.
 */
export async function grantNoteTables(adminDb: AdminDb): Promise<void> {
  await grantRlsTestRole(adminDb, NOTE_TABLES);
  const role = quoteIdentifier(TEST_DB_ROLE);
  await adminDb.execute(sql.raw(`grant update on table "user", "agent_clients" to ${role}`));
  await adminDb.execute(sql.raw(`grant insert, update, delete on table "member_notes" to ${role}`));
}

export type NoteSeed = ReturnType<typeof noteSeedIds>;

export function noteSeedIds(newId: (prefix: string) => string) {
  const id = (name: string) => newId(`mnrls_${name}`);
  return {
    users: {
      agentA: id('agent_a'),
      agentB: id('agent_b'),
      agentC: id('agent_c'),
      staffS: id('staff_s'),
      adminD: id('admin_d'),
      staffT: id('staff_t'),
      m1: id('m1'),
      m2: id('m2'),
      m3: id('m3'),
      m4: id('m4'),
      m6: id('m6'),
      mkMember: id('mk_member'),
      mkAgent: id('mk_agent'),
    },
    notes: {
      n1: id('n1'),
      n2: id('n2'),
      n3: id('n3'),
      n6: id('n6'),
      n7: id('n7'),
      n8: id('n8'),
      n9: id('n9'),
      nt: id('nt'),
      nm: id('nm'),
    },
    assignments: [] as string[],
    created: [] as string[],
  };
}

export async function seedNotes(adminDb: AdminDb, seed: NoteSeed): Promise<void> {
  const u = seed.users;
  const now = new Date();
  const person = (
    userId: string,
    role: string,
    tenantId: string = KS_TENANT_ID,
    agentId: string | null = null
  ) => ({
    id: userId,
    tenantId,
    name: `Notes ${role} ${userId.slice(6, 14)}`,
    email: `${userId}@example.test`,
    emailVerified: true,
    role,
    agentId,
    createdAt: now,
    updatedAt: now,
  });
  await adminDb
    .insert(user)
    .values([
      person(u.agentA, 'agent'),
      person(u.agentB, 'agent'),
      person(u.agentC, 'agent'),
      person(u.staffS, 'staff'),
      person(u.adminD, 'admin'),
      person(u.staffT, 'staff'),
      person(u.m1, 'member'),
      person(u.m2, 'user'),
      person(u.m3, 'member'),
      person(u.m4, 'member'),
      person(u.m6, 'member', KS_TENANT_ID, u.agentA),
      person(u.mkMember, 'member', MK_TENANT_ID),
      person(u.mkAgent, 'agent', MK_TENANT_ID),
    ]);
  const link = (agentId: string, memberId: string, status: string) => {
    const assignmentId = `${agentId}__${memberId}`;
    seed.assignments.push(assignmentId);
    return { id: assignmentId, tenantId: KS_TENANT_ID, agentId, memberId, status };
  };
  await adminDb
    .insert(agentClients)
    .values([
      link(u.agentA, u.m1, 'active'),
      link(u.agentA, u.m2, 'active'),
      link(u.agentA, u.m3, 'inactive'),
      link(u.agentB, u.m4, 'active'),
      link(u.agentA, u.m6, 'inactive'),
      link(u.agentB, u.m6, 'active'),
      link(u.agentA, u.staffT, 'active'),
    ]);
  const n = seed.notes;
  const minute = (value: number) => new Date(Date.UTC(2026, 10, 23, 8, value));
  const note = (
    noteId: string,
    memberId: string,
    authorId: string,
    at: number,
    tenantId: string = KS_TENANT_ID
  ) => ({
    id: noteId,
    tenantId,
    memberId,
    authorId,
    type: 'general' as const,
    content: `content ${noteId}`,
    isPinned: false,
    isInternal: true,
    createdAt: minute(at),
  });
  await adminDb.insert(memberNotes).values([
    note(n.n1, u.m1, u.agentA, 1),
    note(n.n2, u.m1, u.staffS, 2),
    note(n.n3, u.m4, u.agentB, 3),
    note(n.n6, u.m6, u.agentB, 4),
    note(n.n8, u.m6, u.agentA, 5),
    note(n.n9, u.m3, u.agentA, 6),
    note(n.nt, u.staffT, u.adminD, 7),
    // Malformed on purpose: a KS note naming the MK member (no composite key yet, F1).
    note(n.n7, u.mkMember, u.staffS, 8),
    note(n.nm, u.mkMember, u.mkAgent, 9, MK_TENANT_ID),
  ]);
}

export async function cleanupNotes(adminDb: AdminDb, seed: NoteSeed): Promise<void> {
  const userIds = Object.values(seed.users);
  await adminDb.delete(memberNotes).where(inArray(memberNotes.memberId, userIds));
  await adminDb.delete(memberNotes).where(inArray(memberNotes.authorId, userIds));
  await adminDb.delete(agentClients).where(inArray(agentClients.memberId, userIds));
  await adminDb.delete(agentClients).where(inArray(agentClients.agentId, userIds));
  await adminDb.delete(user).where(inArray(user.id, userIds));
}

/**
 * A write held open on its own admin connection: `start` runs the statements and keeps the
 * transaction (and its row locks) open until `commit` or `rollback`.
 */
export async function holdAdminWrite(
  databaseUrl: string,
  statements: (tx: postgres.TransactionSql) => Promise<unknown>
) {
  const client = postgres(databaseUrl, { max: 1 });
  let release!: (commit: boolean) => void;
  const decision = new Promise<boolean>(resolve => {
    release = resolve;
  });
  let pid = 0;
  let ready!: () => void;
  const started = new Promise<void>(resolve => {
    ready = resolve;
  });
  const done = client
    .begin(async tx => {
      const [row] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
      pid = row.pid;
      await statements(tx);
      ready();
      if (!(await decision)) throw new RolledBack();
    })
    .catch(error => {
      if (!(error instanceof RolledBack)) throw error;
    })
    .finally(() => client.end({ timeout: 1 }));
  await Promise.race([started, done]);
  assert.ok(pid > 0, 'the held write started');
  return {
    pid,
    async commit() {
      release(true);
      await done;
    },
    async rollback() {
      release(false);
      await done;
    },
  };
}

class RolledBack extends Error {}

/** Waits until a restricted-role backend is blocked by the given admin backend. */
export async function waitUntilBlockedBy(adminDb: AdminDb, holderPid: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await adminDb.execute<{ pid: number }>(sql`
      select pid from pg_stat_activity
      where usename = ${TEST_DB_ROLE}
        and ${holderPid}::int = any(pg_blocking_pids(pid))`);
    if (rows.length > 0) return;
    await sleep(25);
  }
  assert.fail(`no restricted-role backend was blocked by backend ${holderPid}`);
}

/** Asserts a promise is still pending (blocked), without consuming its outcome. */
export async function assertPending(promise: Promise<unknown>, label: string): Promise<void> {
  const marker = Symbol('pending');
  const settled = promise.then(
    () => 'settled',
    () => 'settled'
  );
  const outcome = await Promise.race([settled, sleep(100, marker)]);
  assert.equal(outcome, marker, `${label} must wait for the held write`);
}
