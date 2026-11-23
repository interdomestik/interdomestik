import assert from 'node:assert/strict';
import test from 'node:test';

import { and, eq, sql } from 'drizzle-orm';

import { agentClients, memberNotes, user } from '../src/schema';
import { raceAgainstHeldWrite } from './activity-access-rls.support';
import { withNotesProof } from './member-notes-restricted-rls.harness';
import { assertPending, waitUntilBlockedBy } from './member-notes-restricted-rls.support';

// R-06 proof for the member-notes commands of @interdomestik/domain-activities: the real commands
// run under the restricted role (no BYPASSRLS) with session authorities, on a disposable
// database. Owner authorization of 2026-11-23 (R-37): agents act only on an actively assigned
// member; staff and admin keep tenant scope.
// This file: a write committed while a command waits on its lock is seen by that command
// (R-17), in the lock order member, assignment, note. Each lock has a test that fails without it.
// The held writes run on the guarded admin client (#2113's raceAgainstHeldWrite, R-13).

test('member notes: races under the restricted role', async t => {
  await withNotesProof(t, async proof => {
    const { adminDb, change, commands, ctx, n, setAssignment, u } = proof;
    const { A, S } = proof;
    const probe = S().authority;
    const noteRow = async (id: string) =>
      (await adminDb.select().from(memberNotes).where(eq(memberNotes.id, id)))[0];

    await t.test('a revocation committed while the command waits is seen', async () => {
      try {
        const result = await raceAgainstHeldWrite({
          adminDb,
          probe,
          hold: tx =>
            tx
              .update(agentClients)
              .set({ status: 'inactive' })
              .where(and(eq(agentClients.agentId, u.agentA), eq(agentClients.memberId, u.m1))),
          act: () => commands.updateMemberNote({ ...A(), input: { id: n.n1, content: 'late' } }),
        });
        assert.deepEqual(result, { ok: false, code: 'NOT_FOUND' });
        assert.equal((await noteRow(n.n1))?.content, `content ${n.n1}`, 'nothing was changed');
      } finally {
        await setAssignment(u.agentA, u.m1, 'active');
      }
    });

    await t.test('a member-role change committed while the command waits is seen', async () => {
      // Only the member row changes and the assignment stays active, so only the lock on the
      // member row can make the waiting command see the change.
      try {
        const result = await raceAgainstHeldWrite({
          adminDb,
          probe,
          hold: tx => tx.update(user).set({ role: 'staff' }).where(eq(user.id, u.m1)),
          act: () => commands.listMemberNotes({ ...A(), input: { memberId: u.m1 } }),
        });
        assert.deepEqual(result, { ok: false, code: 'FORBIDDEN' });
      } finally {
        await adminDb.update(user).set({ role: 'member' }).where(eq(user.id, u.m1));
      }
    });

    await t.test(
      'a reassignment in updateUserAgentCore order is seen by a waiting command',
      async () => {
        try {
          // The member row first, then the assignment: the same order as updateUserAgentCore.
          const result = await raceAgainstHeldWrite({
            adminDb,
            probe,
            hold: async tx => {
              await tx.update(user).set({ agentId: u.agentB }).where(eq(user.id, u.m2));
              await tx
                .update(agentClients)
                .set({ status: 'inactive' })
                .where(and(eq(agentClients.agentId, u.agentA), eq(agentClients.memberId, u.m2)));
            },
            act: () =>
              commands.createMemberNote({
                ...A(),
                input: { memberId: u.m2, content: 'after reassignment' },
              }),
          });
          assert.deepEqual(result, { ok: false, code: 'FORBIDDEN' });
          const rows = await adminDb
            .select({ id: memberNotes.id })
            .from(memberNotes)
            .where(eq(memberNotes.memberId, u.m2));
          assert.deepEqual(rows, []);
        } finally {
          await adminDb.update(user).set({ agentId: null }).where(eq(user.id, u.m2));
          await setAssignment(u.agentA, u.m2, 'active');
        }
      }
    );

    await t.test(
      'a delete committed while an update or a delete waits leaves nothing',
      async () => {
        const waiting: Array<[string, () => Promise<unknown>]> = [
          [n.n2, () => commands.updateMemberNote({ ...S(), input: { id: n.n2, content: 'late' } })],
          [n.nr, () => commands.deleteMemberNote({ ...S(), input: { noteId: n.nr } })],
        ];
        for (const [noteId, act] of waiting) {
          const result = await raceAgainstHeldWrite({
            adminDb,
            probe,
            hold: tx => tx.delete(memberNotes).where(eq(memberNotes.id, noteId)),
            act,
          });
          assert.deepEqual(result, { ok: false, code: 'NOT_FOUND' }, noteId);
          assert.equal(await noteRow(noteId), undefined);
        }
      }
    );

    await t.test('overlapping pin toggles serialize on the note lock', async () => {
      const staff = S();
      const staffActor = proof.access.memberNoteActorOf(staff.session, staff.authority);
      assert.ok(staffActor);
      const initial = (await noteRow(n.n3))?.isPinned;
      let releaseFirst!: () => void;
      const firstMayCommit = new Promise<void>(resolve => {
        releaseFirst = resolve;
      });
      let firstToggled!: () => void;
      const firstHasToggled = new Promise<void>(resolve => {
        firstToggled = resolve;
      });
      let firstPid = 0;
      // The first toggle holds its transaction open after toggling; the second is the public
      // command, which must wait on the note lock until the first commits.
      const first = ctx.withTenantAuthority(staff.authority, async tx => {
        const [{ pid }] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        firstPid = pid;
        const result = await change.toggleMemberNotePinIn(tx, staffActor, n.n3);
        firstToggled();
        await firstMayCommit;
        return result;
      });
      let second: Promise<unknown> = Promise.resolve();
      try {
        // A first transaction that fails before toggling ends the wait with its error.
        await Promise.race([firstHasToggled, first]);
        second = commands.toggleMemberNotePin({ ...S(), input: { noteId: n.n3 } });
        await waitUntilBlockedBy(adminDb, firstPid);
        await assertPending(second, 'the second toggle');
        releaseFirst();
        const flipped = { memberId: u.m4, isPinned: !initial };
        assert.deepEqual(await first, { ok: true, data: { isPinned: !initial }, audit: flipped });
        assert.deepEqual(await second, {
          ok: true,
          data: { isPinned: initial },
          audit: { memberId: u.m4, isPinned: initial },
        });
        assert.equal((await noteRow(n.n3))?.isPinned, initial, 'two toggles restore the state');
      } finally {
        releaseFirst();
        await Promise.allSettled([first, second]);
      }
    });
  });
});
