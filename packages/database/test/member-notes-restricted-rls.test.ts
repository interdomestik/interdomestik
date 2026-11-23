import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, inArray } from 'drizzle-orm';

import { memberNotes } from '../src/schema';
import type { TenantAuthority } from '../src/tenant-authority';
import { assertRestrictedPosture } from './activity-access-rls.support';
import { withNotesProof } from './member-notes-restricted-rls.harness';
import { NOTE_TABLES } from './member-notes-restricted-rls.support';
import { KS_TENANT_ID, MK_TENANT_ID } from './s8-claim-restricted-rls.fixture';

// R-06 proof for the member-notes commands of @interdomestik/domain-activities: the real commands
// run under the restricted role (no BYPASSRLS) with session authorities, on a disposable
// database. Owner authorization of 2026-11-23 (R-37): agents act only on an actively assigned
// member; staff and admin keep tenant scope.
// This file: posture, tenant isolation, the actor and role matrix, list and create. Update,
// delete and pin are in member-notes-restricted-rls-changes.test.ts, the races in
// member-notes-restricted-rls-races.test.ts.

test('member notes: actor matrix and tenant isolation under the restricted role', async t => {
  await withNotesProof(t, async proof => {
    const { access, actor, adminDb, allNoteIds, commands, ctx, ids, n, seed, snapshot, u } = proof;
    const { A, B, C, D, S } = proof;
    const { memberNoteActorOf } = access;
    type Who = ReturnType<typeof A>;
    /** The five commands on reachable targets (n1 on m1, which A, S and D may act on). */
    const everyCommand = async (who: Who, extra: Record<string, unknown> = {}) => [
      await commands.listMemberNotes({ ...who, input: { memberId: u.m1, ...extra } }),
      await commands.createMemberNote({
        ...who,
        input: { memberId: u.m1, content: 'x', ...extra },
      }),
      await commands.updateMemberNote({ ...who, input: { id: n.n1, content: 'x', ...extra } }),
      await commands.deleteMemberNote({ ...who, input: { noteId: n.n1, ...extra } }),
      await commands.toggleMemberNotePin({ ...who, input: { noteId: n.n1, ...extra } }),
    ];
    const countOn = async (memberId: string) =>
      (
        await adminDb
          .select({ id: memberNotes.id })
          .from(memberNotes)
          .where(eq(memberNotes.memberId, memberId))
      ).length;

    await t.test('runs as the restricted role with row security active on each table', async () => {
      await assertRestrictedPosture(A().authority, NOTE_TABLES);
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
        actor(u.agentA, 'agent', { principalRole: 'staff' }),
        actor(u.staffS, 'staff', { principalRole: 'admin' }),
      ];
      for (const who of unbound) {
        assert.equal(memberNoteActorOf(who.session, who.authority), null);
        for (const answer of await everyCommand(who)) {
          assert.deepEqual(answer, { ok: false, code: 'UNAUTHORIZED' });
        }
      }
      assert.deepEqual(await snapshot(), before);
      assert.equal(await countOn(u.m1), 2, 'no note was added');
    });

    await t.test(
      'refuses every role outside agent, staff and admin, on every command',
      async () => {
        const before = await snapshot();
        for (const role of ['member', 'user', 'branch_manager', 'tenant_admin', 'super_admin']) {
          for (const answer of await everyCommand(actor(u.staffS, role))) {
            assert.deepEqual(answer, { ok: false, code: 'FORBIDDEN' }, role);
          }
        }
        assert.deepEqual(await snapshot(), before);
        assert.equal(await countOn(u.m1), 2, 'no note was added');
      }
    );

    await t.test('refuses an injected tenant or author on every command', async () => {
      const before = await snapshot();
      const injected = { tenantId: MK_TENANT_ID, authorId: u.agentB };
      for (const who of [A(), S(), D()]) {
        for (const answer of await everyCommand(who, injected)) {
          assert.partialDeepStrictEqual(answer, { ok: false, code: 'INVALID_INPUT' });
        }
      }
      assert.deepEqual(await snapshot(), before);
      assert.equal(await countOn(u.m1), 2, 'no note was added');
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
  });
});
