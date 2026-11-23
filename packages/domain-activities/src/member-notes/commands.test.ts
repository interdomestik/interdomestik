import { beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '../test/member-notes-db';
import {
  A,
  B,
  D,
  DENIED_ROLES,
  KS,
  MK,
  S,
  actor,
  at,
  notesSnapshot,
  seed,
} from '../test/member-notes-fixture';
import { deleteMemberNote, toggleMemberNotePin, updateMemberNote } from './change';
import { createMemberNote, listMemberNotes } from './commands';

vi.mock(
  '@interdomestik/database',
  async () => (await import('../test/member-notes-db')).databaseModule
);
vi.mock('@interdomestik/database/tenant-authority-context', async () => ({
  withTenantAuthority: (await import('../test/member-notes-db')).withFakeTenantAuthority,
}));
vi.mock('@interdomestik/database/tenant-authority', async () => ({
  readTenantAuthority: (await import('../test/member-notes-fixture')).readFakeAuthority,
}));
vi.mock('nanoid', () => ({ nanoid: () => 'note-new' }));

beforeEach(seed);

describe('every command refuses before any transaction', () => {
  const commands = [
    ['list', listMemberNotes, { memberId: 'm1' }],
    ['create', createMemberNote, { memberId: 'm1', content: 'hello' }],
    ['update', updateMemberNote, { id: 'n1', content: 'hello' }],
    ['delete', deleteMemberNote, { noteId: 'n1' }],
    ['pin', toggleMemberNotePin, { noteId: 'n1' }],
  ] as const;

  it.each(commands)('%s: an unbound actor is UNAUTHORIZED', async (_name, command, input) => {
    const { session, authority } = actor('agent_a', 'agent', { sessionTenantId: MK });
    expect(await command({ session, authority, input })).toEqual({
      ok: false,
      code: 'UNAUTHORIZED',
    });
    expect(store.transactions).toBe(0);
  });

  it.each(commands)(
    '%s: every role outside the allow-list is FORBIDDEN',
    async (_name, command, input) => {
      for (const role of DENIED_ROLES) {
        const { session, authority } = actor('staff_s', role);
        expect(await command({ session, authority, input })).toEqual({
          ok: false,
          code: 'FORBIDDEN',
        });
      }
      expect(store.transactions).toBe(0);
    }
  );

  it.each(commands)(
    '%s: an injected tenant or author is INVALID_INPUT',
    async (_name, command, input) => {
      const { session, authority } = A();
      const injected = { ...input, tenantId: MK, authorId: 'agent_b' };
      const result = await command({ session, authority, input: injected });
      expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
      expect(store.transactions).toBe(0);
    }
  );
});

describe('listMemberNotes', () => {
  const ids = (result: Awaited<ReturnType<typeof listMemberNotes>>) =>
    result.ok ? result.data.map(row => row.id) : result;

  it('lists an actively assigned member for the agent, newest first, in one transaction', async () => {
    expect(ids(await listMemberNotes({ ...A(), input: { memberId: 'm1' } }))).toEqual(['n2', 'n1']);
    expect(store.statements.map(({ tx, table, lock }) => [tx, table, lock])).toEqual([
      [1, 'user', 'share'],
      [1, 'agentClients', 'share'],
      [1, 'memberNotes', null],
    ]);
  });

  it('admits the legacy member role `user`', async () => {
    expect(await listMemberNotes({ ...A(), input: { memberId: 'm2' } })).toMatchObject({
      ok: true,
      data: [],
    });
  });

  it.each([
    ['an inactive assignment', 'm3'],
    ["another agent's member", 'm4'],
    ['a member it only referred', 'm6'],
    ['a non-member account, even when assigned', 'staff_t'],
    ['a member of another tenant', 'mk1'],
    ['an unknown id', 'nobody'],
  ])('refuses the agent on %s', async (_label, memberId) => {
    expect(await listMemberNotes({ ...A(), input: { memberId } })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('admits the current assignee of a member another agent referred', async () => {
    expect(ids(await listMemberNotes({ ...B(), input: { memberId: 'm6' } }))).toEqual(['n8', 'n6']);
  });

  it('keeps tenant scope for staff and admin', async () => {
    expect(ids(await listMemberNotes({ ...S(), input: { memberId: 'm1' } }))).toEqual(['n2', 'n1']);
    expect(ids(await listMemberNotes({ ...D(), input: { memberId: 'm4' } }))).toEqual(['n3']);
  });

  it.each(['staff_t', 'mk1', 'nobody'])(
    'answers staff with an empty list for target %s (as on base), without reading notes',
    async memberId => {
      expect(await listMemberNotes({ ...S(), input: { memberId } })).toEqual({
        ok: true,
        data: [],
        audit: null,
      });
      expect(store.statements.some(statement => statement.table === 'memberNotes')).toBe(false);
    }
  );

  it('propagates a database error', async () => {
    store.failNextSelect = new Error('connection lost');
    await expect(listMemberNotes({ ...A(), input: { memberId: 'm1' } })).rejects.toThrow(
      'connection lost'
    );
  });
});

describe('createMemberNote', () => {
  it('stores tenant and author from the actor, sanitized, with the base defaults', async () => {
    const result = await createMemberNote({
      ...A(),
      input: { memberId: 'm1', content: '  <b>Called</b> the member  ' },
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        id: 'note-new',
        memberId: 'm1',
        authorId: 'agent_a',
        authorName: 'Name agent_a',
        content: 'Called the member',
        type: 'general',
        isPinned: false,
        isInternal: true,
        followUpDate: null,
        updatedAt: null,
      },
      audit: { memberId: 'm1', noteType: 'general', isPinned: false, isInternal: true },
    });
    expect(store.rows.memberNotes.find(row => row.id === 'note-new')).toMatchObject({
      tenantId: KS,
      authorId: 'agent_a',
    });
    expect(store.statements.map(({ table, kind, lock }) => [table, kind, lock])).toEqual([
      ['user', 'select', 'share'],
      ['agentClients', 'select', 'share'],
      ['memberNotes', 'insert', null],
    ]);
  });

  it.each([
    ['agent', A, 'm3'],
    ['agent', A, 'm4'],
    ['agent', A, 'm6'],
    ['agent', A, 'staff_t'],
    ['agent', A, 'mk1'],
    ['staff', S, 'staff_t'],
    ['staff', S, 'mk1'],
    ['admin', D, 'mk1'],
    ['admin', D, 'nobody'],
  ] as const)('refuses the %s on target %s and inserts nothing', async (_role, who, memberId) => {
    const before = notesSnapshot();
    expect(await createMemberNote({ ...who(), input: { memberId, content: 'x' } })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(notesSnapshot()).toEqual(before);
  });

  it('refuses content that is empty once sanitized, before any transaction', async () => {
    expect(
      await createMemberNote({ ...A(), input: { memberId: 'm1', content: '<i></i>' } })
    ).toEqual({
      ok: false,
      code: 'EMPTY_CONTENT',
    });
    expect(store.transactions).toBe(0);
  });
});
