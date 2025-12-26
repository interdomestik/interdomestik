import { db } from '@interdomestik/database';
import { memberNotes } from '@interdomestik/database/schema';
import { nanoid } from 'nanoid';
import type { ActionResult, CreateNoteInput, MemberNote, NoteType } from '../member-notes.types';
import { createNoteSchema } from '../member-notes.types';
import { canAccessNotes } from './access';
import type { Session } from './context';

export async function createMemberNoteCore(params: {
  session: NonNullable<Session> | null;
  data: CreateNoteInput;
}): Promise<ActionResult<MemberNote>> {
  const { session, data } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canAccessNotes(session.user.role)) return { success: false, error: 'Access denied' };

  const validated = createNoteSchema.safeParse(data);
  if (!validated.success) return { success: false, error: validated.error.message };

  try {
    const newNote = {
      id: nanoid(),
      memberId: validated.data.memberId,
      authorId: session.user.id,
      type: validated.data.type ?? 'general',
      content: validated.data.content,
      isPinned: validated.data.isPinned ?? false,
      isInternal: validated.data.isInternal ?? true,
      followUpDate: validated.data.followUpDate ?? null,
      createdAt: new Date(),
      updatedAt: null,
    };

    await db.insert(memberNotes).values(newNote);

    return {
      success: true,
      data: {
        ...newNote,
        authorName: session.user.name ?? 'Unknown',
        type: newNote.type as NoteType,
      },
    };
  } catch (error) {
    console.error('Error creating note:', error);
    return { success: false, error: 'Failed to create note' };
  }
}
