import { authorizedSession } from '@/test/safe-action-harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  write: vi.fn(),
  audit: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  pin: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.audit }));
vi.mock('@interdomestik/domain-activities/member-notes', async importOriginal => ({
  ...(await importOriginal<object>()),
  listMemberNotes: mocks.list,
  createMemberNote: mocks.create,
  updateMemberNote: mocks.update,
  deleteMemberNote: mocks.remove,
  toggleMemberNotePin: mocks.pin,
}));

import {
  createMemberNote,
  deleteMemberNote,
  getMemberNotes,
  toggleNotePin,
  updateMemberNote,
} from '@/actions/member-notes';

const AGENT = { id: 'agent-a', role: 'agent', tenantId: 'tenant-a', name: 'Agent A' };

const NOTE = {
  id: 'note-1',
  memberId: 'member-1',
  authorId: 'agent-a',
  authorName: 'Agent A',
  type: 'general',
  content: 'hello',
  isPinned: false,
  isInternal: true,
  followUpDate: null,
  createdAt: new Date('2026-11-23T08:00:00Z'),
  updatedAt: null,
};

type Case = {
  name: string;
  action: (input: unknown) => Promise<unknown>;
  command: ReturnType<typeof vi.fn>;
  input: Record<string, unknown>;
  subject: Record<string, unknown>;
  notAuthor?: string;
};

const CASES: Case[] = [
  {
    name: 'memberNotes.list',
    action: getMemberNotes,
    command: mocks.list,
    input: { memberId: 'member-1' },
    subject: { type: 'member', id: 'member-1' },
  },
  {
    name: 'memberNotes.create',
    action: createMemberNote,
    command: mocks.create,
    input: { memberId: 'member-1', content: 'hello' },
    subject: { type: 'member', id: 'member-1' },
  },
  {
    name: 'memberNotes.update',
    action: updateMemberNote,
    command: mocks.update,
    input: { id: 'note-1', content: 'hello' },
    subject: { type: 'none' },
    notAuthor: 'You can only edit your own notes',
  },
  {
    name: 'memberNotes.delete',
    action: deleteMemberNote,
    command: mocks.remove,
    input: { noteId: 'note-1' },
    subject: { type: 'none' },
    notAuthor: 'You can only delete your own notes',
  },
  {
    name: 'memberNotes.pin',
    action: toggleNotePin,
    command: mocks.pin,
    input: { noteId: 'note-1' },
    subject: { type: 'none' },
  },
];

const refusals = () =>
  mocks.write.mock.calls.map(([event]) => event).filter(event => event.action === 'action.refused');
const noteEvents = () => mocks.audit.mock.calls.map(([event]) => event);

function expectOneRefusal(c: Case, code: string, actorId = AGENT.id) {
  expect(refusals()).toEqual([
    expect.objectContaining({
      entityId: c.name,
      actorId,
      metadata: { code, basis: 'role', subject: c.subject },
    }),
  ]);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue(authorizedSession(AGENT));
  mocks.write.mockResolvedValue({ ok: true });
});

describe.each(CASES)('$name', c => {
  it('passes the session, its authority and the parsed input to the domain command', async () => {
    const context = authorizedSession(AGENT);
    mocks.authorize.mockResolvedValue(context);
    c.command.mockResolvedValue({ ok: false, code: 'FORBIDDEN' });

    await c.action(c.input);

    expect(c.command).toHaveBeenCalledExactlyOnceWith({
      session: context.session,
      authority: context.authority,
      input: c.input,
    });
  });

  it('answers UNAUTHORIZED without a session and never calls the command', async () => {
    mocks.authorize.mockResolvedValue(null);
    expect(await c.action(c.input)).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(c.command).not.toHaveBeenCalled();
  });

  it.each(['member', 'user', 'branch_manager', 'tenant_admin', 'super_admin', 'promoter'])(
    'refuses the %s role before the command and records it',
    async role => {
      const actor = { ...AGENT, id: `${role}-1`, role, branchId: 'branch-1' };
      mocks.authorize.mockResolvedValue(authorizedSession(actor));
      expect(await c.action(c.input)).toMatchObject({ success: false, code: 'FORBIDDEN' });
      expect(c.command).not.toHaveBeenCalled();
      expectOneRefusal(c, 'FORBIDDEN', actor.id);
    }
  );

  it.each(['tenantId', 'authorId', 'agentId'])(
    'rejects an injected %s before the command, without a refusal row',
    async key => {
      expect(await c.action({ ...c.input, [key]: 'injected' })).toMatchObject({
        success: false,
        code: 'VALIDATION_ERROR',
      });
      expect(c.command).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );

  it('rejects a bare string input (the old call shape)', async () => {
    expect(await c.action('member-1')).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(c.command).not.toHaveBeenCalled();
  });

  it('records a domain FORBIDDEN and answers Access denied', async () => {
    c.command.mockResolvedValue({ ok: false, code: 'FORBIDDEN' });
    expect(await c.action(c.input)).toEqual({
      success: false,
      code: 'FORBIDDEN',
      error: 'Access denied',
    });
    expectOneRefusal(c, 'FORBIDDEN');
    expect(noteEvents()).toEqual([]);
  });

  it('records NOT_FOUND as a refusal but answers Not found', async () => {
    c.command.mockResolvedValue({ ok: false, code: 'NOT_FOUND' });
    expect(await c.action(c.input)).toEqual({
      success: false,
      code: 'NOT_FOUND',
      error: 'Not found',
    });
    expectOneRefusal(c, 'FORBIDDEN');
  });

  it('answers UNAUTHORIZED when the domain refuses the actor binding', async () => {
    c.command.mockResolvedValue({ ok: false, code: 'UNAUTHORIZED' });
    expect(await c.action(c.input)).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expectOneRefusal(c, 'UNAUTHORIZED');
  });

  it('turns a thrown error into INTERNAL_SERVER_ERROR with no refusal and no note event', async () => {
    c.command.mockRejectedValue(new Error('connection lost'));
    expect(await c.action(c.input)).toMatchObject({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(refusals()).toEqual([]);
    expect(noteEvents()).toEqual([]);
  });

  if (c.notAuthor) {
    const message = c.notAuthor;
    it('records NOT_AUTHOR as FORBIDDEN with the base message', async () => {
      c.command.mockResolvedValue({ ok: false, code: 'NOT_AUTHOR' });
      expect(await c.action(c.input)).toEqual({
        success: false,
        code: 'FORBIDDEN',
        error: message,
      });
      expectOneRefusal(c, 'FORBIDDEN');
    });
  }
});

describe('results and audit events', () => {
  it('list returns the rows and writes nothing', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: [NOTE], audit: null });
    expect(await getMemberNotes({ memberId: 'member-1' })).toEqual({ success: true, data: [NOTE] });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('create returns the note and records member_note.created', async () => {
    const audit = { memberId: 'member-1', noteType: 'general', isPinned: false, isInternal: true };
    mocks.create.mockResolvedValue({ ok: true, data: NOTE, audit });
    expect(await createMemberNote({ memberId: 'member-1', content: 'hello' })).toEqual({
      success: true,
      data: NOTE,
    });
    expect(noteEvents()).toEqual([
      expect.objectContaining({
        action: 'member_note.created',
        entityType: 'member_note',
        entityId: 'note-1',
        actorId: AGENT.id,
        actorRole: 'agent',
        authority: expect.anything(),
        metadata: audit,
      }),
    ]);
    expect(refusals()).toEqual([]);
  });

  it('update records member_note.updated with the changed fields', async () => {
    const audit = { memberId: 'member-1', updatedFields: ['content'] };
    mocks.update.mockResolvedValue({ ok: true, data: NOTE, audit });
    expect(await updateMemberNote({ id: 'note-1', content: 'hello' })).toEqual({
      success: true,
      data: NOTE,
    });
    expect(noteEvents()).toEqual([
      expect.objectContaining({
        action: 'member_note.updated',
        entityId: 'note-1',
        metadata: audit,
      }),
    ]);
  });

  it('update answers EMPTY_CONTENT as a validation error without a refusal row', async () => {
    mocks.update.mockResolvedValue({ ok: false, code: 'EMPTY_CONTENT' });
    expect(await updateMemberNote({ id: 'note-1', content: '<p></p>' })).toEqual({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Content cannot be empty',
    });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('delete returns no data and records member_note.deleted', async () => {
    mocks.remove.mockResolvedValue({ ok: true, data: undefined, audit: { memberId: 'member-1' } });
    expect(await deleteMemberNote({ noteId: 'note-1' })).toEqual({ success: true });
    expect(noteEvents()).toEqual([
      expect.objectContaining({
        action: 'member_note.deleted',
        entityId: 'note-1',
        metadata: { memberId: 'member-1' },
      }),
    ]);
  });

  it('pin returns the new state and records member_note.pin_toggled', async () => {
    const audit = { memberId: 'member-1', isPinned: true };
    mocks.pin.mockResolvedValue({ ok: true, data: { isPinned: true }, audit });
    expect(await toggleNotePin({ noteId: 'note-1' })).toEqual({
      success: true,
      data: { isPinned: true },
    });
    expect(noteEvents()).toEqual([
      expect.objectContaining({
        action: 'member_note.pin_toggled',
        entityId: 'note-1',
        metadata: audit,
      }),
    ]);
  });

  it('create accepts a follow-up date and refuses an unknown note type', async () => {
    mocks.create.mockResolvedValue({ ok: false, code: 'FORBIDDEN' });
    const followUpDate = new Date('2026-12-01T09:00:00Z');
    await createMemberNote({ memberId: 'member-1', content: 'x', followUpDate, type: 'call' });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { memberId: 'member-1', content: 'x', followUpDate, type: 'call' },
      })
    );
    expect(
      await createMemberNote({ memberId: 'member-1', content: 'x', type: 'sms' })
    ).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
  });
});
