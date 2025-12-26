import { db } from '@interdomestik/database';
import { memberNotes } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import type { ActionResult } from '../member-notes.types';
import { canAccessNotes } from './access';
import type { Session } from './context';

export async function deleteMemberNoteCore(params: {
  session: NonNullable<Session> | null;
  noteId: string;
}): Promise<ActionResult> {
  const { session, noteId } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canAccessNotes(session.user.role)) return { success: false, error: 'Access denied' };

  try {
    const [existing] = await db
      .select()
      .from(memberNotes)
      .where(eq(memberNotes.id, noteId))
      .limit(1);
    if (!existing) return { success: false, error: 'Note not found' };
    if (existing.authorId !== session.user.id && session.user.role !== 'admin') {
      return { success: false, error: 'You can only delete your own notes' };
    }

    await db.delete(memberNotes).where(eq(memberNotes.id, noteId));
    return { success: true };
  } catch (error) {
    console.error('Error deleting note:', error);
    return { success: false, error: 'Failed to delete note' };
  }
}
