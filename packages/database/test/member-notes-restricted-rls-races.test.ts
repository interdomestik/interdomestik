import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, sql } from 'drizzle-orm';

import { memberNotes, user } from '../src/schema';
import { withNotesProof } from './member-notes-restricted-rls.harness';
import {
  assertPending,
  holdAdminWrite,
  waitUntilBlockedBy,
} from './member-notes-restricted-rls.support';

// R-06 proof for the member-notes commands of @interdomestik/domain-activities: the real commands
// run under the restricted role (no BYPASSRLS) with session authorities, on a disposable
// database. Owner authorization of 2026-11-23 (R-37): agents act only on an actively assigned
// member; staff and admin keep tenant scope.
// This file: a write committed while a command waits on its lock is seen by that command
// (R-17), in the lock order member, assignment, note.

test('member notes: races under the restricted role', async t => {
  await withNotesProof(t, async proof => {
    const { access, adminDb, change, commands, ctx, databaseUrl, n, setAssignment, u } = proof;
    const { A, S } = proof;
    const { memberNoteActorOf } = access;
    const { toggleMemberNotePinIn } = change;

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
        assert.equal(row.content, `content ${n.n1}`, 'the waiting update changed nothing');
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
  });
});
