import { beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '../test/member-notes-db';
import { A, D, S, at, notesSnapshot, seed } from '../test/member-notes-fixture';
import { deleteMemberNote, toggleMemberNotePin, updateMemberNote } from './change';

// The fake authority registry first, then the in-memory database and its transaction runner.
vi.mock('@interdomestik/database/tenant-authority', async () => ({
  readTenantAuthority: (await import('../test/member-notes-fixture')).readFakeAuthority,
}));
vi.mock('@interdomestik/database', async () => {
  const fake = await import('../test/member-notes-db');
  return fake.databaseModule;
});
vi.mock('@interdomestik/database/tenant-authority-context', async () => {
  const fake = await import('../test/member-notes-db');
  return { withTenantAuthority: fake.withFakeTenantAuthority };
});

beforeEach(seed);

describe('updateMemberNote', () => {
  it('updates its own note on an assigned member, locking member, assignment, then note', async () => {
    const result = await updateMemberNote({
      ...A(),
      input: { id: 'n1', content: 'Updated <b>x</b>' },
    });
    expect(result).toMatchObject({
      ok: true,
      data: { id: 'n1', content: 'Updated x', authorName: 'Name agent_a' },
      audit: { memberId: 'm1', updatedFields: ['content'] },
    });
    expect(store.statements.map(({ tx, table, kind, lock }) => [tx, table, kind, lock])).toEqual([
      [1, 'memberNotes', 'select', null],
      [1, 'user', 'select', 'share'],
      [1, 'agentClients', 'select', 'share'],
      [1, 'memberNotes', 'select', 'update'],
      [1, 'memberNotes', 'update', null],
      [1, 'memberNotes', 'select', null],
    ]);
  });

  it.each(['n8', 'n9', 'n3', 'n6', 'n7', 'nt', 'nm', 'nobody'])(
    'answers the agent NOT_FOUND on note %s and changes nothing',
    async id => {
      const before = notesSnapshot();
      expect(await updateMemberNote({ ...A(), input: { id, content: 'x' } })).toEqual({
        ok: false,
        code: 'NOT_FOUND',
      });
      expect(notesSnapshot()).toEqual(before);
    }
  );

  it("refuses a colleague's note on its own member as NOT_AUTHOR", async () => {
    const before = notesSnapshot();
    expect(await updateMemberNote({ ...A(), input: { id: 'n2', content: 'x' } })).toEqual({
      ok: false,
      code: 'NOT_AUTHOR',
    });
    expect(await updateMemberNote({ ...S(), input: { id: 'n1', content: 'x' } })).toEqual({
      ok: false,
      code: 'NOT_AUTHOR',
    });
    expect(notesSnapshot()).toEqual(before);
  });

  it('lets staff edit their own note and an admin any note', async () => {
    expect(await updateMemberNote({ ...S(), input: { id: 'n2', isPinned: true } })).toMatchObject({
      ok: true,
    });
    expect(await updateMemberNote({ ...D(), input: { id: 'n3', type: 'call' } })).toMatchObject({
      ok: true,
      data: { type: 'call' },
    });
  });

  it.each(['nt', 'n7', 'nm'])(
    'answers the admin NOT_FOUND on malformed or foreign note %s',
    async id => {
      expect(await updateMemberNote({ ...D(), input: { id, content: 'x' } })).toEqual({
        ok: false,
        code: 'NOT_FOUND',
      });
    }
  );

  it('refuses content that is empty once sanitized and keeps the previous content', async () => {
    expect(await updateMemberNote({ ...A(), input: { id: 'n1', content: '<p></p>' } })).toEqual({
      ok: false,
      code: 'EMPTY_CONTENT',
    });
    expect(store.rows.memberNotes.find(row => row.id === 'n1')?.content).toBe('content n1');
  });
});

describe('deleteMemberNote', () => {
  it('deletes its own note on an assigned member', async () => {
    expect(await deleteMemberNote({ ...A(), input: { noteId: 'n1' } })).toEqual({
      ok: true,
      data: undefined,
      audit: { memberId: 'm1' },
    });
    expect(store.rows.memberNotes.some(row => row.id === 'n1')).toBe(false);
  });

  it('refuses its own notes once the assignment ended, and staff on a note they did not write', async () => {
    const before = notesSnapshot();
    expect(await deleteMemberNote({ ...A(), input: { noteId: 'n8' } })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(await deleteMemberNote({ ...A(), input: { noteId: 'n9' } })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(await deleteMemberNote({ ...S(), input: { noteId: 'n1' } })).toEqual({
      ok: false,
      code: 'NOT_AUTHOR',
    });
    expect(notesSnapshot()).toEqual(before);
  });

  it('lets an admin delete any note on a member target', async () => {
    expect(await deleteMemberNote({ ...D(), input: { noteId: 'n3' } })).toMatchObject({ ok: true });
  });
});

describe('toggleMemberNotePin', () => {
  it("lets the agent pin a colleague's note on its own member, and toggles back", async () => {
    expect(await toggleMemberNotePin({ ...A(), input: { noteId: 'n2' } })).toEqual({
      ok: true,
      data: { isPinned: true },
      audit: { memberId: 'm1', isPinned: true },
    });
    expect(await toggleMemberNotePin({ ...A(), input: { noteId: 'n2' } })).toMatchObject({
      data: { isPinned: false },
    });
    expect(store.statements.filter(s => s.lock === 'update')).toHaveLength(2);
  });

  it.each(['n3', 'n8', 'n9', 'nt', 'n7', 'nm'])(
    'answers the agent NOT_FOUND on note %s',
    async noteId => {
      const before = notesSnapshot();
      expect(await toggleMemberNotePin({ ...A(), input: { noteId } })).toEqual({
        ok: false,
        code: 'NOT_FOUND',
      });
      expect(notesSnapshot()).toEqual(before);
    }
  );

  it('keeps tenant-wide pinning for staff, but not on a non-member target', async () => {
    expect(await toggleMemberNotePin({ ...S(), input: { noteId: 'n1' } })).toMatchObject({
      ok: true,
    });
    expect(await toggleMemberNotePin({ ...S(), input: { noteId: 'nt' } })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
    });
  });
});

describe('updateMemberNote field handling', () => {
  it('changes only the fields given and clears a follow-up date on null', async () => {
    const row = store.rows.memberNotes.find(candidate => candidate.id === 'n1');
    if (row) row.followUpDate = at(30);
    expect(await updateMemberNote({ ...A(), input: { id: 'n1', isPinned: true } })).toMatchObject({
      ok: true,
      data: { content: 'content n1', type: 'general', isPinned: true, followUpDate: at(30) },
      audit: { updatedFields: ['isPinned'] },
    });
    expect(
      await updateMemberNote({ ...A(), input: { id: 'n1', followUpDate: null, type: 'call' } })
    ).toMatchObject({
      ok: true,
      data: { type: 'call', isPinned: true, followUpDate: null },
      audit: { updatedFields: ['type', 'followUpDate'] },
    });
  });
});
