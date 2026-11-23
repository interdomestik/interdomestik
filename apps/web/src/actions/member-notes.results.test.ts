import { authorizedSession } from '@/test/safe-action-harness';
import { ADMIN, AGENT, NOTE, STAFF } from './member-notes.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The domain commands are replaced by name; the schemas stay real, so the wrapper parses input.
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  write: vi.fn(),
  audit: vi.fn(),
  domain: {
    listMemberNotes: vi.fn(),
    createMemberNote: vi.fn(),
    updateMemberNote: vi.fn(),
    deleteMemberNote: vi.fn(),
    toggleMemberNotePin: vi.fn(),
  },
}));
const { domain } = mocks;

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.audit }));
vi.mock('@interdomestik/domain-activities/member-notes', async importOriginal =>
  Object.assign({}, await importOriginal<object>(), mocks.domain)
);

import {
  createMemberNote,
  deleteMemberNote,
  getMemberNotes,
  toggleNotePin,
  updateMemberNote,
} from '@/actions/member-notes';

const refusals = () =>
  mocks.write.mock.calls.map(([event]) => event).filter(event => event.action === 'action.refused');
const noteEvents = () => mocks.audit.mock.calls.map(([event]) => event);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue(authorizedSession(AGENT));
  mocks.write.mockResolvedValue({ ok: true });
});

describe('the declared basis admits agent, staff and admin to every action', () => {
  const calls = [
    ['list', () => getMemberNotes({ memberId: 'member-1' }), domain.listMemberNotes, [NOTE]],
    [
      'create',
      () => createMemberNote({ memberId: 'member-1', content: 'x' }),
      domain.createMemberNote,
      NOTE,
    ],
    [
      'update',
      () => updateMemberNote({ id: 'note-1', content: 'x' }),
      domain.updateMemberNote,
      NOTE,
    ],
    ['delete', () => deleteMemberNote({ noteId: 'note-1' }), domain.deleteMemberNote, undefined],
    [
      'pin',
      () => toggleNotePin({ noteId: 'note-1' }),
      domain.toggleMemberNotePin,
      { isPinned: true },
    ],
  ] as const;

  it.each([AGENT, STAFF, ADMIN])('$role reaches each domain command and succeeds', async who => {
    mocks.authorize.mockResolvedValue(authorizedSession(who));
    for (const [name, call, command, data] of calls) {
      command.mockResolvedValue({
        ok: true,
        data,
        audit: name === 'list' ? null : { memberId: 'member-1' },
      });
      expect(await call(), name).toMatchObject({ success: true });
      expect(command, name).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({
            user: expect.objectContaining({ id: who.id, role: who.role }),
          }),
        })
      );
    }
    expect(refusals()).toEqual([]);
  });
});

describe('results and audit events', () => {
  it('list returns the rows and writes nothing', async () => {
    domain.listMemberNotes.mockResolvedValue({ ok: true, data: [NOTE], audit: null });
    expect(await getMemberNotes({ memberId: 'member-1' })).toEqual({ success: true, data: [NOTE] });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('create returns the note and records member_note.created', async () => {
    const audit = { memberId: 'member-1', noteType: 'general', isPinned: false, isInternal: true };
    domain.createMemberNote.mockResolvedValue({ ok: true, data: NOTE, audit });
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
    domain.updateMemberNote.mockResolvedValue({ ok: true, data: NOTE, audit });
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
    domain.updateMemberNote.mockResolvedValue({ ok: false, code: 'EMPTY_CONTENT' });
    expect(await updateMemberNote({ id: 'note-1', content: '<p></p>' })).toEqual({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Content cannot be empty',
    });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('delete returns no data and records member_note.deleted', async () => {
    domain.deleteMemberNote.mockResolvedValue({
      ok: true,
      data: undefined,
      audit: { memberId: 'member-1' },
    });
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
    domain.toggleMemberNotePin.mockResolvedValue({ ok: true, data: { isPinned: true }, audit });
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
    domain.createMemberNote.mockResolvedValue({ ok: false, code: 'FORBIDDEN' });
    const followUpDate = new Date('2026-12-01T09:00:00Z');
    await createMemberNote({ memberId: 'member-1', content: 'x', followUpDate, type: 'call' });
    expect(domain.createMemberNote).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { memberId: 'member-1', content: 'x', followUpDate, type: 'call' },
      })
    );
    expect(
      await createMemberNote({ memberId: 'member-1', content: 'x', type: 'sms' })
    ).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
  });
});
