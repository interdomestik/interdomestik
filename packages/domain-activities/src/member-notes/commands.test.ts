import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '../test/member-notes-db';
import { memberNoteActorOf, memberNoteScope } from './access';
import {
  createMemberNote,
  deleteMemberNote,
  listMemberNotes,
  toggleMemberNotePin,
  updateMemberNote,
} from './commands';
import { sanitizeNoteContent } from './schema';

vi.mock(
  '@interdomestik/database',
  async () => (await import('../test/member-notes-db')).databaseModule
);
vi.mock('@interdomestik/database/tenant-authority-context', async () => ({
  withTenantAuthority: (await import('../test/member-notes-db')).withFakeTenantAuthority,
}));
vi.mock('nanoid', () => ({ nanoid: () => 'note-new' }));

// The descriptor registry, as in the database module: an unknown token is no authority. Session
// authorities are minted only by the request path; the restricted-role proof mints real ones.
const authorities = vi.hoisted(() => new WeakMap<object, unknown>());
vi.mock('@interdomestik/database/tenant-authority', () => ({
  readTenantAuthority: (token: object) => {
    const descriptor = authorities.get(token);
    if (!descriptor) throw new Error('Unknown tenant authority');
    return descriptor;
  },
}));

function mintAuthority(descriptor: {
  tenantId: string;
  accessTenantId: string;
  purpose: 'session' | 'test';
  principal: { userId: string; role: string | null; branchId: null; agentId: null } | null;
}): TenantAuthority {
  const token = Object.freeze(Object.create(null)) as TenantAuthority;
  authorities.set(token, Object.freeze({ ...descriptor, expiresAtMs: Number.MAX_SAFE_INTEGER }));
  return token;
}

const KS = 'tenant_ks';
const MK = 'tenant_mk';

type Principal = { userId: string; role: string | null } | null;

/** A session and the session authority minted from it, as authorizeSessionTenant pairs them. */
function actor(
  userId: string,
  role: string,
  overrides: {
    tenantId?: string;
    sessionTenantId?: string | null;
    accessTenantId?: string;
    purpose?: 'session' | 'test';
    principal?: Principal;
    sessionRole?: string;
  } = {}
) {
  const tenantId = overrides.tenantId ?? KS;
  const principal =
    overrides.principal === undefined ? { userId, role } : (overrides.principal as Principal);
  return {
    session: {
      user: {
        id: userId,
        role: overrides.sessionRole ?? role,
        tenantId: overrides.sessionTenantId === undefined ? tenantId : overrides.sessionTenantId,
        name: `Name ${userId}`,
      },
    },
    authority: mintAuthority({
      tenantId,
      accessTenantId: overrides.accessTenantId ?? tenantId,
      purpose: overrides.purpose ?? 'session',
      principal: principal ? { ...principal, branchId: null, agentId: null } : null,
    }),
  };
}

const A = () => actor('agent_a', 'agent');
const B = () => actor('agent_b', 'agent');
const S = () => actor('staff_s', 'staff');
const D = () => actor('admin_d', 'admin');

const at = (minute: number) => new Date(Date.UTC(2026, 10, 23, 8, minute));

function note(id: string, memberId: string, authorId: string, minute: number, tenantId = KS) {
  return {
    id,
    tenantId,
    memberId,
    authorId,
    type: 'general',
    content: `content ${id}`,
    isPinned: false,
    isInternal: true,
    followUpDate: null,
    createdAt: at(minute),
    updatedAt: null,
  };
}

function seed() {
  store.reset();
  const person = (id: string, role: string, tenantId = KS, agentId: string | null = null) => ({
    id,
    tenantId,
    role,
    name: `Name ${id}`,
    agentId,
  });
  store.rows.user.push(
    person('agent_a', 'agent'),
    person('agent_b', 'agent'),
    person('staff_s', 'staff'),
    person('admin_d', 'admin'),
    person('staff_t', 'staff'),
    person('m1', 'member'),
    person('m2', 'user'),
    person('m3', 'member'),
    person('m4', 'member'),
    person('m6', 'member', KS, 'agent_a'),
    person('mk1', 'member', MK)
  );
  const link = (agentId: string, memberId: string, status: string, tenantId = KS) => ({
    id: `ac_${agentId}_${memberId}`,
    tenantId,
    agentId,
    memberId,
    status,
  });
  store.rows.agentClients.push(
    link('agent_a', 'm1', 'active'),
    link('agent_a', 'm2', 'active'),
    link('agent_a', 'm3', 'inactive'),
    link('agent_b', 'm4', 'active'),
    link('agent_a', 'm6', 'inactive'),
    link('agent_b', 'm6', 'active'),
    // An assignment to a non-member account: the member-account check alone must refuse it.
    link('agent_a', 'staff_t', 'active')
  );
  store.rows.memberNotes.push(
    note('n1', 'm1', 'agent_a', 1),
    note('n2', 'm1', 'staff_s', 2),
    note('n3', 'm4', 'agent_b', 3),
    note('n6', 'm6', 'agent_b', 4),
    note('n8', 'm6', 'agent_a', 5),
    note('n9', 'm3', 'agent_a', 6),
    note('nt', 'staff_t', 'admin_d', 7),
    // Malformed: a KS note naming the MK member.
    note('n7', 'mk1', 'staff_s', 8),
    note('nm', 'mk1', 'agent_mk', 9, MK)
  );
}

const notesSnapshot = () => JSON.parse(JSON.stringify(store.rows.memberNotes));
const DENIED_ROLES = [
  'member',
  'user',
  'branch_manager',
  'tenant_admin',
  'super_admin',
  'promoter',
  'auditor',
  'global_support',
  'unknown_role',
];

beforeEach(seed);

describe('memberNoteActorOf', () => {
  it('binds the actor to a matching session authority', () => {
    const { session, authority } = A();
    expect(memberNoteActorOf(session, authority)).toEqual({
      tenantId: KS,
      userId: 'agent_a',
      role: 'agent',
    });
  });

  it.each([
    ['a test authority', actor('agent_a', 'agent', { purpose: 'test' })],
    [
      'an unknown token',
      { ...actor('agent_a', 'agent'), authority: Object.freeze({}) as TenantAuthority },
    ],
    ['a missing principal', actor('agent_a', 'agent', { principal: null })],
    [
      'a principal without a role',
      actor('agent_a', 'agent', { principal: { userId: 'agent_a', role: null } }),
    ],
    [
      'another principal user',
      actor('agent_a', 'agent', { principal: { userId: 'agent_b', role: 'agent' } }),
    ],
    ['a padded session role', actor('agent_a', 'agent', { sessionRole: 'agent ' })],
    ['another session role', actor('agent_a', 'agent', { sessionRole: 'staff' })],
    ['another session tenant', actor('agent_a', 'agent', { sessionTenantId: MK })],
    ['a session without a tenant', actor('agent_a', 'agent', { sessionTenantId: null })],
    ['another access tenant', actor('agent_a', 'agent', { accessTenantId: MK })],
  ])('refuses %s', (_label, { session, authority }) => {
    expect(memberNoteActorOf(session, authority)).toBeNull();
  });
});

describe('memberNoteScope', () => {
  it('keeps the base allow-list: agent assigned, staff and admin tenant-wide', () => {
    expect(memberNoteScope('agent')).toBe('assigned');
    expect(memberNoteScope('staff')).toBe('tenant');
    expect(memberNoteScope('admin')).toBe('tenant');
  });

  it.each(DENIED_ROLES)('denies %s', role => {
    expect(memberNoteScope(role)).toBe('denied');
  });
});

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

describe('sanitizeNoteContent', () => {
  it.each([
    ['<script>alert()</script>Valid Content', 'alert()Valid Content'],
    ['  a < b and c > d  ', 'a  d'],
    ['unclosed <tag', 'unclosed <tag'],
    ['x'.repeat(2100), 'x'.repeat(2000)],
  ])('turns %j into %j', (raw, clean) => {
    expect(sanitizeNoteContent(raw)).toBe(clean);
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
