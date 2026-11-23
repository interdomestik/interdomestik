import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, inArray, sql } from 'drizzle-orm';

import { memberNotes } from '../src/schema';
import type { TenantAuthority } from '../src/tenant-authority';
import { withNotesProof } from './member-notes-restricted-rls.harness';
import { TEST_DB_ROLE } from './rls-test-connection';
import { KS_TENANT_ID, MK_TENANT_ID } from './s8-claim-restricted-rls.fixture';

// R-06 proof for the member-notes commands of @interdomestik/domain-activities: the real commands
// run under the restricted role (no BYPASSRLS) with session authorities, on a disposable
// database. Owner authorization of 2026-11-23 (R-37): agents act only on an actively assigned
// member; staff and admin keep tenant scope.
// This file: the actor matrix and tenant isolation. The races are in
// member-notes-restricted-rls-races.test.ts.

test('member notes: actor matrix and tenant isolation under the restricted role', async t => {
  await withNotesProof(t, async proof => {
    const {
      access,
      actor,
      adminDb,
      allNoteIds,
      commands,
      ctx,
      ids,
      n,
      seed,
      setAssignment,
      snapshot,
      u,
    } = proof;
    const { A, B, C, D, S } = proof;
    const { memberNoteActorOf } = access;

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
      assert.deepEqual(
        ks.map(row => row.id).sort((left, right) => left.localeCompare(right)),
        allNoteIds.filter(id => id !== n.nm).sort((left, right) => left.localeCompare(right))
      );
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
  });
});
