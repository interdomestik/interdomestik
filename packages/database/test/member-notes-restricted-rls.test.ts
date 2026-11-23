import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { agentClients, memberNotes, user } from '../src/schema';
import type { TenantAuthority } from '../src/tenant-authority';
import {
  assertPending,
  cleanupNotes,
  grantNoteTables,
  holdAdminWrite,
  noteSeedIds,
  seedNotes,
  waitUntilBlockedBy,
} from './member-notes-restricted-rls.support';
import { TEST_DB_ROLE } from './rls-test-connection';
import {
  KS_TENANT_ID,
  MK_TENANT_ID,
  openS8RestrictedSession,
} from './s8-claim-restricted-rls.fixture';

// R-06 proof for the member-notes commands of @interdomestik/domain-activities: the real commands
// run under the restricted role (no BYPASSRLS) with session authorities, on a disposable
// database. Owner authorization of 2026-11-23 (R-37): agents act only on an actively assigned
// member; staff and admin keep tenant scope.

test('member notes: actor matrix, tenant isolation and races under the restricted role', async t => {
  const session = await openS8RestrictedSession(t);
  if (!session) return;
  const { adminDb, fixture } = session;
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const seed = noteSeedIds(fixture.newId);
  const u = seed.users;
  const n = seed.notes;
  const failures: unknown[] = [];

  try {
    await grantNoteTables(adminDb);
    await seedNotes(adminDb, seed);
    const [
      commands,
      { toggleMemberNotePinIn },
      { memberNoteActorOf },
      ctx,
      { mintTenantAuthority },
    ] = await Promise.all([
      import('../../domain-activities/src/member-notes'),
      import('../../domain-activities/src/member-notes/commands'),
      import('../../domain-activities/src/member-notes/access'),
      import('../src/tenant-authority-context'),
      import('../src/tenant-authority'),
    ]);

    type Overrides = {
      purpose?: 'session' | 'test';
      authorityTenant?: string;
      principalUser?: string;
      sessionTenant?: string;
    };
    /** A session and a session authority minted for it, as the request path pairs them. */
    const actor = (userId: string, role: string, overrides: Overrides = {}) => {
      const tenantId = overrides.authorityTenant ?? KS_TENANT_ID;
      const authority: TenantAuthority = mintTenantAuthority({
        tenantId,
        accessTenantId: tenantId,
        purpose: overrides.purpose ?? 'session',
        principal: {
          userId: overrides.principalUser ?? userId,
          role,
          branchId: null,
          agentId: null,
        },
      });
      return {
        session: {
          user: { id: userId, role, tenantId: overrides.sessionTenant ?? KS_TENANT_ID, name: role },
        },
        authority,
      };
    };
    const A = () => actor(u.agentA, 'agent');
    const B = () => actor(u.agentB, 'agent');
    const C = () => actor(u.agentC, 'agent');
    const S = () => actor(u.staffS, 'staff');
    const D = () => actor(u.adminD, 'admin');

    const allNoteIds = [...Object.values(n)];
    const snapshot = async () =>
      adminDb
        .select()
        .from(memberNotes)
        .where(inArray(memberNotes.id, allNoteIds))
        .orderBy(memberNotes.id);
    const ids = (result: { ok: boolean; data?: unknown }) =>
      result.ok ? (result.data as { id: string }[]).map(row => row.id) : result;
    const setAssignment = (agentId: string, memberId: string, status: string) =>
      adminDb
        .update(agentClients)
        .set({ status })
        .where(and(eq(agentClients.agentId, agentId), eq(agentClients.memberId, memberId)));

    await t.test('runs as the restricted role with row security not bypassable', async () => {
      const [row] = await ctx.withTenantAuthority(A().authority, tx =>
        tx.execute<{ currentUser: string; bypass: boolean; superuser: boolean }>(sql`
          select current_user as "currentUser", rolbypassrls as bypass, rolsuper as superuser
          from pg_roles where rolname = current_user`)
      );
      assert.deepEqual(row, { currentUser: TEST_DB_ROLE, bypass: false, superuser: false });
    });

    await t.test('row security alone hides the other tenant’s notes', async () => {
      const read = (authority: TenantAuthority) =>
        ctx.withTenantAuthority(authority, tx =>
          tx
            .select({ id: memberNotes.id })
            .from(memberNotes)
            .where(inArray(memberNotes.id, allNoteIds))
            .orderBy(memberNotes.id)
        );
      const ks = await read(S().authority);
      assert.deepEqual(ks.map(row => row.id).sort(), allNoteIds.filter(id => id !== n.nm).sort());
      const mk = await read(actor(u.mkAgent, 'agent', { authorityTenant: MK_TENANT_ID }).authority);
      assert.deepEqual(mk, [{ id: n.nm }]);
    });

    await t.test('refuses an actor not bound to its session', async () => {
      const before = await snapshot();
      const unbound = [
        actor(u.agentA, 'agent', { purpose: 'test' }),
        actor(u.agentA, 'agent', { principalUser: u.agentB }),
        actor(u.agentA, 'agent', { authorityTenant: MK_TENANT_ID }),
        actor(u.agentA, 'agent', { sessionTenant: MK_TENANT_ID }),
      ];
      for (const who of unbound) {
        assert.equal(memberNoteActorOf(who.session, who.authority), null);
        assert.deepEqual(await commands.listMemberNotes({ ...who, input: { memberId: u.m1 } }), {
          ok: false,
          code: 'UNAUTHORIZED',
        });
        assert.deepEqual(await commands.toggleMemberNotePin({ ...who, input: { noteId: n.n1 } }), {
          ok: false,
          code: 'UNAUTHORIZED',
        });
      }
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('refuses every role outside agent, staff and admin', async () => {
      for (const role of ['member', 'user', 'branch_manager', 'tenant_admin', 'super_admin']) {
        const who = actor(u.staffS, role);
        assert.deepEqual(await commands.listMemberNotes({ ...who, input: { memberId: u.m1 } }), {
          ok: false,
          code: 'FORBIDDEN',
        });
        assert.deepEqual(
          await commands.createMemberNote({ ...who, input: { memberId: u.m1, content: 'x' } }),
          { ok: false, code: 'FORBIDDEN' }
        );
      }
    });

    await t.test(
      'lists only for an active assignment, or tenant-wide for staff and admin',
      async () => {
        assert.deepEqual(
          ids(await commands.listMemberNotes({ ...A(), input: { memberId: u.m1 } })),
          [n.n2, n.n1]
        );
        assert.deepEqual(
          ids(await commands.listMemberNotes({ ...A(), input: { memberId: u.m2 } })),
          []
        );
        for (const memberId of [u.m3, u.m4, u.m6, u.staffT, u.mkMember]) {
          assert.deepEqual(await commands.listMemberNotes({ ...A(), input: { memberId } }), {
            ok: false,
            code: 'FORBIDDEN',
          });
        }
        assert.deepEqual(await commands.listMemberNotes({ ...C(), input: { memberId: u.m1 } }), {
          ok: false,
          code: 'FORBIDDEN',
        });
        assert.deepEqual(
          ids(await commands.listMemberNotes({ ...B(), input: { memberId: u.m6 } })),
          [n.n8, n.n6]
        );
        assert.deepEqual(
          ids(await commands.listMemberNotes({ ...S(), input: { memberId: u.m4 } })),
          [n.n3]
        );
        for (const memberId of [u.staffT, u.mkMember]) {
          assert.deepEqual(
            ids(await commands.listMemberNotes({ ...D(), input: { memberId } })),
            []
          );
        }
      }
    );

    await t.test(
      'creates with tenant and author from the actor, and only on a reachable member',
      async () => {
        const before = await snapshot();
        for (const [who, memberId] of [
          [A, u.m3],
          [A, u.m4],
          [A, u.m6],
          [A, u.staffT],
          [A, u.mkMember],
          [S, u.staffT],
          [D, u.mkMember],
        ] as const) {
          assert.deepEqual(
            await commands.createMemberNote({ ...who(), input: { memberId, content: 'x' } }),
            { ok: false, code: 'FORBIDDEN' }
          );
        }
        assert.deepEqual(await snapshot(), before);
        const extra = await adminDb
          .select({ id: memberNotes.id })
          .from(memberNotes)
          .where(inArray(memberNotes.memberId, [u.m3, u.m4, u.m6, u.staffT, u.mkMember]));
        assert.equal(extra.length, 7, 'no note was added to an unreachable member');

        const created = await commands.createMemberNote({
          ...A(),
          input: { memberId: u.m1, content: ' <b>Called</b> ' },
        });
        assert.ok(created.ok);
        seed.created.push(created.data.id);
        const [stored] = await adminDb
          .select()
          .from(memberNotes)
          .where(eq(memberNotes.id, created.data.id));
        assert.partialDeepStrictEqual(stored, {
          tenantId: KS_TENANT_ID,
          memberId: u.m1,
          authorId: u.agentA,
          content: 'Called',
          type: 'general',
          isPinned: false,
          isInternal: true,
        });
      }
    );

    await t.test(
      'changes a note only on a reachable member, by its author or an admin',
      async () => {
        const before = await snapshot();
        for (const id of [n.n3, n.n6, n.n7, n.n8, n.n9, n.nt, n.nm]) {
          assert.deepEqual(
            await commands.updateMemberNote({ ...A(), input: { id, content: 'x' } }),
            {
              ok: false,
              code: 'NOT_FOUND',
            }
          );
          assert.deepEqual(await commands.deleteMemberNote({ ...A(), input: { noteId: id } }), {
            ok: false,
            code: 'NOT_FOUND',
          });
          assert.deepEqual(await commands.toggleMemberNotePin({ ...A(), input: { noteId: id } }), {
            ok: false,
            code: 'NOT_FOUND',
          });
        }
        for (const id of [n.nt, n.n7, n.nm]) {
          assert.deepEqual(
            await commands.updateMemberNote({ ...D(), input: { id, content: 'x' } }),
            {
              ok: false,
              code: 'NOT_FOUND',
            }
          );
        }
        assert.deepEqual(
          await commands.updateMemberNote({ ...A(), input: { id: n.n2, content: 'x' } }),
          {
            ok: false,
            code: 'NOT_AUTHOR',
          }
        );
        assert.deepEqual(await commands.deleteMemberNote({ ...S(), input: { noteId: n.n1 } }), {
          ok: false,
          code: 'NOT_AUTHOR',
        });
        assert.deepEqual(await snapshot(), before);

        const updated = await commands.updateMemberNote({
          ...A(),
          input: { id: n.n1, content: 'Updated', isPinned: true },
        });
        assert.ok(updated.ok);
        assert.deepEqual(updated.audit, { memberId: u.m1, updatedFields: ['content', 'isPinned'] });
        const pinned = await commands.toggleMemberNotePin({ ...A(), input: { noteId: n.n2 } });
        assert.deepEqual(pinned, {
          ok: true,
          data: { isPinned: true },
          audit: { memberId: u.m1, isPinned: true },
        });
        assert.ok(
          (await commands.updateMemberNote({ ...D(), input: { id: n.n3, type: 'call' } })).ok
        );
        const [n1, n2, n3] = await adminDb
          .select({
            id: memberNotes.id,
            content: memberNotes.content,
            isPinned: memberNotes.isPinned,
            type: memberNotes.type,
          })
          .from(memberNotes)
          .where(inArray(memberNotes.id, [n.n1, n.n2, n.n3]))
          .then(rows => [n.n1, n.n2, n.n3].map(id => rows.find(row => row.id === id)));
        assert.deepEqual(n1, { id: n.n1, content: 'Updated', isPinned: true, type: 'general' });
        assert.deepEqual(n2, {
          id: n.n2,
          content: `content ${n.n2}`,
          isPinned: true,
          type: 'general',
        });
        assert.deepEqual(n3, {
          id: n.n3,
          content: `content ${n.n3}`,
          isPinned: false,
          type: 'call',
        });
      }
    );

    await t.test('an ended assignment takes the agent’s own notes away at once', async () => {
      await setAssignment(u.agentA, u.m1, 'inactive');
      try {
        assert.deepEqual(await commands.listMemberNotes({ ...A(), input: { memberId: u.m1 } }), {
          ok: false,
          code: 'FORBIDDEN',
        });
        assert.deepEqual(await commands.deleteMemberNote({ ...A(), input: { noteId: n.n1 } }), {
          ok: false,
          code: 'NOT_FOUND',
        });
      } finally {
        await setAssignment(u.agentA, u.m1, 'active');
      }
    });

    await t.test('a revocation committed while the command waits is seen', async () => {
      const held = await holdAdminWrite(
        databaseUrl,
        tx =>
          tx`update agent_clients set status = 'inactive'
           where agent_id = ${u.agentA} and member_id = ${u.m1}`
      );
      const running = commands.updateMemberNote({ ...A(), input: { id: n.n1, content: 'late' } });
      try {
        await waitUntilBlockedBy(adminDb, held.pid);
        await assertPending(running, 'the update');
        await held.commit();
        assert.deepEqual(await running, { ok: false, code: 'NOT_FOUND' });
        const [row] = await adminDb.select().from(memberNotes).where(eq(memberNotes.id, n.n1));
        assert.equal(row.content, 'Updated');
      } finally {
        await held.rollback().catch(() => undefined);
        await running.catch(() => undefined);
        await setAssignment(u.agentA, u.m1, 'active');
      }
    });

    await t.test(
      'a reassignment in updateUserAgentCore order is seen by a waiting command',
      async () => {
        // The member row first, then the assignment: the same order as updateUserAgentCore.
        const held = await holdAdminWrite(databaseUrl, async tx => {
          await tx`update "user" set "agentId" = ${u.agentB} where id = ${u.m2}`;
          await tx`update agent_clients set status = 'inactive'
                 where agent_id = ${u.agentA} and member_id = ${u.m2}`;
        });
        const running = commands.createMemberNote({
          ...A(),
          input: { memberId: u.m2, content: 'after reassignment' },
        });
        try {
          await waitUntilBlockedBy(adminDb, held.pid);
          await assertPending(running, 'the create');
          await held.commit();
          assert.deepEqual(await running, { ok: false, code: 'FORBIDDEN' });
          const rows = await adminDb
            .select({ id: memberNotes.id })
            .from(memberNotes)
            .where(eq(memberNotes.memberId, u.m2));
          assert.deepEqual(rows, []);
        } finally {
          await held.rollback().catch(() => undefined);
          await running.catch(() => undefined);
          await adminDb.update(user).set({ agentId: null }).where(eq(user.id, u.m2));
          await setAssignment(u.agentA, u.m2, 'active');
        }
      }
    );

    await t.test('a delete committed while an update waits leaves nothing to update', async () => {
      const held = await holdAdminWrite(
        databaseUrl,
        tx => tx`delete from member_notes where id = ${n.n2}`
      );
      const running = commands.updateMemberNote({ ...S(), input: { id: n.n2, content: 'late' } });
      try {
        await waitUntilBlockedBy(adminDb, held.pid);
        await assertPending(running, 'the update');
        await held.commit();
        assert.deepEqual(await running, { ok: false, code: 'NOT_FOUND' });
        const rows = await adminDb.select().from(memberNotes).where(eq(memberNotes.id, n.n2));
        assert.deepEqual(rows, []);
      } finally {
        await held.rollback().catch(() => undefined);
        await running.catch(() => undefined);
      }
    });

    await t.test('overlapping pin toggles serialize on the note lock', async () => {
      const staff = S();
      const staffActor = memberNoteActorOf(staff.session, staff.authority);
      assert.ok(staffActor);
      const [{ isPinned: initial }] = await adminDb
        .select({ isPinned: memberNotes.isPinned })
        .from(memberNotes)
        .where(eq(memberNotes.id, n.n3));
      let releaseFirst!: () => void;
      const firstMayCommit = new Promise<void>(resolve => {
        releaseFirst = resolve;
      });
      let firstToggled!: () => void;
      const firstHasToggled = new Promise<void>(resolve => {
        firstToggled = resolve;
      });
      let firstPid = 0;
      const first = ctx.withTenantAuthority(staff.authority, async tx => {
        const [{ pid }] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        firstPid = pid;
        const result = await toggleMemberNotePinIn(tx, staffActor, n.n3);
        firstToggled();
        await firstMayCommit;
        return result;
      });
      let second: Promise<unknown> = Promise.resolve();
      try {
        await firstHasToggled;
        second = ctx.withTenantAuthority(staff.authority, tx =>
          toggleMemberNotePinIn(tx, staffActor, n.n3)
        );
        await waitUntilBlockedBy(adminDb, firstPid);
        await assertPending(second, 'the second toggle');
        releaseFirst();
        assert.deepEqual(await first, {
          ok: true,
          data: { isPinned: !initial },
          audit: { memberId: u.m4, isPinned: !initial },
        });
        assert.deepEqual(await second, {
          ok: true,
          data: { isPinned: initial },
          audit: { memberId: u.m4, isPinned: initial },
        });
        const [row] = await adminDb
          .select({ isPinned: memberNotes.isPinned })
          .from(memberNotes)
          .where(eq(memberNotes.id, n.n3));
        assert.equal(row.isPinned, initial, 'two toggles return the note to its state');
      } finally {
        releaseFirst();
        await Promise.allSettled([first, second]);
      }
    });
  } catch (error) {
    failures.push(error);
  } finally {
    for (const cleanup of [() => cleanupNotes(adminDb, seed), () => session.close()]) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
  }

  for (const error of failures.slice(1)) {
    t.diagnostic(`Additional cleanup failure: ${inspect(error)}`);
  }
  if (failures.length > 0) throw failures[0];
});
