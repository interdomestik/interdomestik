'use server';

import type {
  ActionResult,
  CreateNoteInput,
  MemberNote,
  UpdateNoteInput,
} from './member-notes.types';

// Re-export types for consumers
export type { MemberNote, NoteType } from './member-notes.types';

import { getActionContext } from './member-notes/context';
import { createMemberNoteCore } from './member-notes/create';
import { deleteMemberNoteCore } from './member-notes/delete';
import { getMemberNotesCore } from './member-notes/get';
import { toggleNotePinCore } from './member-notes/pin';
import { updateMemberNoteCore } from './member-notes/update';

/** Get all notes for a member */
export async function getMemberNotes(memberId: string): Promise<ActionResult<MemberNote[]>> {
  const { session } = await getActionContext();
  return getMemberNotesCore({ session, memberId });
}

/** Create a new note for a member */
export async function createMemberNote(data: CreateNoteInput): Promise<ActionResult<MemberNote>> {
  const { session } = await getActionContext();
  return createMemberNoteCore({ session, data });
}

/** Update an existing note */
export async function updateMemberNote(data: UpdateNoteInput): Promise<ActionResult<MemberNote>> {
  const { session } = await getActionContext();
  return updateMemberNoteCore({ session, data });
}

/** Delete a note */
export async function deleteMemberNote(noteId: string): Promise<ActionResult> {
  const { session } = await getActionContext();
  return deleteMemberNoteCore({ session, noteId });
}

/** Toggle pin status of a note */
export async function toggleNotePin(noteId: string): Promise<ActionResult<{ isPinned: boolean }>> {
  const { session } = await getActionContext();
  return toggleNotePinCore({ session, noteId });
}
