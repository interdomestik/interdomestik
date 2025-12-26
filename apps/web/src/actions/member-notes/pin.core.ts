import { db } from '@interdomestik/database';
import { memberNotes } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import type { ActionResult } from '../member-notes.types';
import { canAccessNotes } from './access';
import type { Session } from './context';

export async function toggleNotePinCore(params: {
  session: NonNullable<Session> | null;
  noteId: string;
}): Promise<ActionResult<{ isPinned: boolean }>> {
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

    const newPinned = !existing.isPinned;
    await db.update(memberNotes).set({ isPinned: newPinned }).where(eq(memberNotes.id, noteId));
    return { success: true, data: { isPinned: newPinned } };
  } catch (error) {
    console.error('Error toggling pin:', error);
    return { success: false, error: 'Failed to toggle pin' };
  }
}
