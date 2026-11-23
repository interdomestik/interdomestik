'use server';

import {
  actionFailure,
  defineAction,
  type ActionFailure,
  type ProtectedActionContext,
} from '@/lib/safe-action';
import { logAuditEvent } from '@/lib/audit';
import {
  createMemberNote as createNote,
  createNoteSchema,
  deleteMemberNote as deleteNote,
  listMemberNotes as listNotes,
  listNotesSchema,
  noteIdSchema,
  toggleMemberNotePin as togglePin,
  updateMemberNote as updateNote,
  updateNoteSchema,
  type MemberNoteFailure,
} from '@interdomestik/domain-activities/member-notes';
import { ROLES } from '@interdomestik/shared-auth';

export type { MemberNote, NoteType } from '@interdomestik/domain-activities/member-notes';

// Who may act on which member's notes is decided in the domain command (R-16): agents on an
// actively assigned member only; staff and admin tenant-wide. The basis here is the outer gate.
const NOTE_ROLES = [ROLES.agent, ROLES.staff, ROLES.admin];

function failureOf(failure: MemberNoteFailure, notAuthorMessage?: string): ActionFailure {
  switch (failure.code) {
    case 'UNAUTHORIZED':
      return actionFailure('UNAUTHORIZED');
    case 'FORBIDDEN':
      return actionFailure('FORBIDDEN', 'Access denied');
    case 'NOT_FOUND':
      // Recorded as a refusal, answered as NOT_FOUND: no answer tells a note exists (R-37 list).
      return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
    case 'NOT_AUTHOR':
      return actionFailure('FORBIDDEN', notAuthorMessage);
    case 'EMPTY_CONTENT':
      return actionFailure('VALIDATION_ERROR', 'Content cannot be empty');
    case 'INVALID_INPUT':
      return actionFailure('VALIDATION_ERROR');
  }
}

async function recordNoteEvent(
  { session, authority }: ProtectedActionContext,
  action: string,
  noteId: string,
  metadata: Record<string, unknown>
) {
  await logAuditEvent({
    actorId: session.user.id,
    actorRole: session.user.role,
    authority,
    action,
    entityType: 'member_note',
    entityId: noteId,
    metadata,
  });
}

/** A member's notes, pinned first, newest first. */
export const getMemberNotes = defineAction({
  name: 'memberNotes.list',
  basis: { kind: 'role', roles: NOTE_ROLES },
  input: listNotesSchema,
  subject: { type: 'member', from: 'memberId' },
  async handler(input, { session, authority }) {
    const result = await listNotes({ session, authority, input });
    return result.ok ? result.data : failureOf(result);
  },
});

/** Creates a note on a member; tenant and author come from the session. */
export const createMemberNote = defineAction({
  name: 'memberNotes.create',
  basis: { kind: 'role', roles: NOTE_ROLES },
  input: createNoteSchema,
  subject: { type: 'member', from: 'memberId' },
  async handler(input, ctx) {
    const result = await createNote({ session: ctx.session, authority: ctx.authority, input });
    if (!result.ok) return failureOf(result);
    await recordNoteEvent(ctx, 'member_note.created', result.data.id, result.audit);
    return result.data;
  },
});

/** Updates a note its author wrote, or any note for an admin. */
export const updateMemberNote = defineAction({
  name: 'memberNotes.update',
  basis: { kind: 'role', roles: NOTE_ROLES },
  input: updateNoteSchema,
  subject: { type: 'none' },
  async handler(input, ctx) {
    const result = await updateNote({ session: ctx.session, authority: ctx.authority, input });
    if (!result.ok) return failureOf(result, 'You can only edit your own notes');
    await recordNoteEvent(ctx, 'member_note.updated', result.data.id, result.audit);
    return result.data;
  },
});

/** Deletes a note its author wrote, or any note for an admin. */
export const deleteMemberNote = defineAction({
  name: 'memberNotes.delete',
  basis: { kind: 'role', roles: NOTE_ROLES },
  input: noteIdSchema,
  subject: { type: 'none' },
  async handler(input, ctx) {
    const result = await deleteNote({ session: ctx.session, authority: ctx.authority, input });
    if (!result.ok) return failureOf(result, 'You can only delete your own notes');
    await recordNoteEvent(ctx, 'member_note.deleted', input.noteId, result.audit);
    return undefined;
  },
});

/** Pins or unpins a note on a member the actor may act on. */
export const toggleNotePin = defineAction({
  name: 'memberNotes.pin',
  basis: { kind: 'role', roles: NOTE_ROLES },
  input: noteIdSchema,
  subject: { type: 'none' },
  async handler(input, ctx) {
    const result = await togglePin({ session: ctx.session, authority: ctx.authority, input });
    if (!result.ok) return failureOf(result);
    await recordNoteEvent(ctx, 'member_note.pin_toggled', input.noteId, result.audit);
    return result.data;
  },
});
