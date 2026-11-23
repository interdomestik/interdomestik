import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { inArray, sql } from 'drizzle-orm';

import { agentClients, memberNotes, user } from '../src/schema';
import { TEST_DB_ROLE } from './rls-test-connection';
import {
  KS_TENANT_ID,
  MK_TENANT_ID,
  type S8RestrictedSession,
} from './s8-claim-restricted-rls.fixture';

// Seed and race helpers for the member-notes restricted-role proofs. Every id is unique per run,
// and cleanup deletes by id, so a failed or partial run leaves nothing behind.

type AdminDb = S8RestrictedSession['adminDb'];

export const NOTE_TABLES = ['member_notes', 'user', 'agent_clients'] as const;

/**
 * The privileges the commands use, granted for one proof file and revoked after it
 * (`grantTablePrivileges`). Row locks (FOR SHARE, FOR UPDATE) need UPDATE besides SELECT, so the
 * role gets UPDATE on `user` and `agent_clients` too; the commands never write either table.
 */
export const NOTE_GRANTS = [
  ['select, update', 'user'],
  ['select, update', 'agent_clients'],
  ['select, insert, update, delete', 'member_notes'],
] as const;

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
      m7: id('m7'),
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
      // On m7, for the delete cases and the delete race.
      nd1: id('nd1'),
      nd2: id('nd2'),
      nd3: id('nd3'),
      nr: id('nr'),
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
      person(u.m7, 'member'),
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
      link(u.agentA, u.m7, 'active'),
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
    note(n.nd1, u.m7, u.agentA, 10),
    note(n.nd2, u.m7, u.agentB, 11),
    note(n.nd3, u.m7, u.staffS, 12),
    note(n.nr, u.m7, u.staffS, 13),
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

/** Waits until a restricted-role backend is blocked by the given backend (read as the admin). */
export async function waitUntilBlockedBy(
  adminDb: AdminDb,
  holderPid: number,
  attemptsLeft = 200
): Promise<void> {
  const rows = await adminDb.execute<{ pid: number }>(sql`
    select pid from pg_stat_activity
    where usename = ${TEST_DB_ROLE}
      and ${holderPid}::int = any(pg_blocking_pids(pid))`);
  if (rows.length > 0) return;
  if (attemptsLeft <= 1)
    assert.fail(`no restricted-role backend was blocked by backend ${holderPid}`);
  await sleep(25);
  return waitUntilBlockedBy(adminDb, holderPid, attemptsLeft - 1);
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
