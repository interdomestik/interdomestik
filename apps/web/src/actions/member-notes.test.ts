import { authorizedSession } from '@/test/safe-action-harness';
import { AGENT } from './member-notes.test-support';
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
