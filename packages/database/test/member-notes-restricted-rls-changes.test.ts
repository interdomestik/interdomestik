import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, inArray } from 'drizzle-orm';

import { memberNotes } from '../src/schema';
import { withNotesProof } from './member-notes-restricted-rls.harness';

// R-06 proof for the member-notes commands of @interdomestik/domain-activities: the real commands
// run under the restricted role (no BYPASSRLS) with session authorities, on a disposable
// database. Owner authorization of 2026-11-23 (R-37): agents act only on an actively assigned
// member; staff and admin keep tenant scope.
// This file: update, delete and pin by role and target, the public answer and the stored state.

const NOT_FOUND = { ok: false, code: 'NOT_FOUND' };

test('member notes: update, delete and pin under the restricted role', async t => {
  await withNotesProof(t, async proof => {
    const { adminDb, commands, n, setAssignment, snapshot, u } = proof;
    const { A, B, D, S } = proof;
    type Who = ReturnType<typeof A>;
    const changeAll = async (who: Who, id: string) => [
      await commands.updateMemberNote({ ...who, input: { id, content: 'x' } }),
      await commands.deleteMemberNote({ ...who, input: { noteId: id } }),
      await commands.toggleMemberNotePin({ ...who, input: { noteId: id } }),
    ];
    const rowsOf = (ids: string[]) =>
      adminDb
        .select({
          id: memberNotes.id,
          content: memberNotes.content,
          isPinned: memberNotes.isPinned,
          type: memberNotes.type,
        })
        .from(memberNotes)
        .where(inArray(memberNotes.id, ids))
        .then(rows => ids.map(id => rows.find(row => row.id === id)));

    await t.test('conceals every note the actor may not reach, and changes nothing', async () => {
      const before = await snapshot();
      // The agent: other agents' members, inactive or referral-only links, a non-member
      // account, the malformed cross-tenant note (F1) and the other tenant's note.
      for (const id of [n.n3, n.n6, n.n7, n.n8, n.n9, n.nt, n.nm]) {
        assert.deepEqual(await changeAll(A(), id), [NOT_FOUND, NOT_FOUND, NOT_FOUND], id);
      }
      // Staff and admin: the non-member account, the malformed note and the other tenant's note.
      for (const who of [S, D]) {
        for (const id of [n.nt, n.n7, n.nm]) {
          assert.deepEqual(await changeAll(who(), id), [NOT_FOUND, NOT_FOUND, NOT_FOUND], id);
        }
      }
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('lets only the author or an admin edit or delete', async () => {
      // A and S both reach m1: A's n1 and S's n2 are each other's colleague's notes.
      const before = await snapshot();
      const notAuthor = { ok: false, code: 'NOT_AUTHOR' };
      for (const [who, id] of [
        [A, n.n2],
        [S, n.n1],
      ] as const) {
        assert.deepEqual(
          await commands.updateMemberNote({ ...who(), input: { id, content: 'x' } }),
          notAuthor
        );
        assert.deepEqual(
          await commands.deleteMemberNote({ ...who(), input: { noteId: id } }),
          notAuthor
        );
      }
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('edits and pins within scope, writing only the named fields', async () => {
      const updated = await commands.updateMemberNote({
        ...A(),
        input: { id: n.n1, content: 'Updated', isPinned: true },
      });
      assert.ok(updated.ok);
      assert.deepEqual(updated.audit, { memberId: u.m1, updatedFields: ['content', 'isPinned'] });
      assert.deepEqual(await commands.toggleMemberNotePin({ ...A(), input: { noteId: n.n2 } }), {
        ok: true,
        data: { isPinned: true },
        audit: { memberId: u.m1, isPinned: true },
      });
      assert.ok(
        (await commands.updateMemberNote({ ...D(), input: { id: n.n3, type: 'call' } })).ok
      );
      assert.ok(
        (await commands.updateMemberNote({ ...S(), input: { id: n.n2, content: 'Staff edit' } })).ok
      );
      // B, the current assignee of m6, pins both its notes there, its own and the referrer's.
      for (const noteId of [n.n6, n.n8]) {
        assert.deepEqual(await commands.toggleMemberNotePin({ ...B(), input: { noteId } }), {
          ok: true,
          data: { isPinned: true },
          audit: { memberId: u.m6, isPinned: true },
        });
      }
      assert.deepEqual(await rowsOf([n.n1, n.n2, n.n3, n.n6, n.n8]), [
        { id: n.n1, content: 'Updated', isPinned: true, type: 'general' },
        { id: n.n2, content: 'Staff edit', isPinned: true, type: 'general' },
        { id: n.n3, content: `content ${n.n3}`, isPinned: false, type: 'call' },
        { id: n.n6, content: `content ${n.n6}`, isPinned: true, type: 'general' },
        { id: n.n8, content: `content ${n.n8}`, isPinned: true, type: 'general' },
      ]);
    });

    await t.test(
      'refuses content that is empty once sanitized and keeps the stored note',
      async () => {
        const before = await snapshot();
        assert.deepEqual(
          await commands.updateMemberNote({ ...A(), input: { id: n.n1, content: '<p> </p>' } }),
          { ok: false, code: 'EMPTY_CONTENT' }
        );
        assert.deepEqual(await snapshot(), before);
      }
    );

    await t.test('deletes for the author agent, the author staff and any admin', async () => {
      for (const [who, id] of [
        [A, n.nd1],
        [S, n.nd3],
        [D, n.nd2],
      ] as const) {
        assert.deepEqual(await commands.deleteMemberNote({ ...who(), input: { noteId: id } }), {
          ok: true,
          data: undefined,
          audit: { memberId: u.m7 },
        });
      }
      const left = await adminDb
        .select({ id: memberNotes.id })
        .from(memberNotes)
        .where(eq(memberNotes.memberId, u.m7));
      assert.deepEqual(left, [{ id: n.nr }]);
    });

    await t.test('an ended assignment takes the agent’s own notes away at once', async () => {
      await setAssignment(u.agentA, u.m1, 'inactive');
      try {
        const before = await snapshot();
        assert.deepEqual(await commands.listMemberNotes({ ...A(), input: { memberId: u.m1 } }), {
          ok: false,
          code: 'FORBIDDEN',
        });
        assert.deepEqual(await changeAll(A(), n.n1), [NOT_FOUND, NOT_FOUND, NOT_FOUND]);
        assert.deepEqual(await snapshot(), before);
      } finally {
        await setAssignment(u.agentA, u.m1, 'active');
      }
    });
  });
});
