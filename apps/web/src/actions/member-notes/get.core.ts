import { db } from '@interdomestik/database';
import { memberNotes, user as userTable } from '@interdomestik/database/schema';
import { desc, eq } from 'drizzle-orm';
import type { ActionResult, MemberNote } from '../member-notes.types';
import { canAccessNotes } from './access';
import type { Session } from './context';
import { mapNoteRow } from './map';

export async function getMemberNotesCore(params: {
  session: NonNullable<Session> | null;
  memberId: string;
}): Promise<ActionResult<MemberNote[]>> {
  const { session, memberId } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canAccessNotes(session.user.role)) return { success: false, error: 'Access denied' };

  try {
    const rows = await db
      .select({
        id: memberNotes.id,
        memberId: memberNotes.memberId,
        authorId: memberNotes.authorId,
        authorName: userTable.name,
        type: memberNotes.type,
        content: memberNotes.content,
        isPinned: memberNotes.isPinned,
        isInternal: memberNotes.isInternal,
        followUpDate: memberNotes.followUpDate,
        createdAt: memberNotes.createdAt,
        updatedAt: memberNotes.updatedAt,
      })
      .from(memberNotes)
      .leftJoin(userTable, eq(memberNotes.authorId, userTable.id))
      .where(eq(memberNotes.memberId, memberId))
      .orderBy(desc(memberNotes.isPinned), desc(memberNotes.createdAt));

    return { success: true, data: rows.map(mapNoteRow) };
  } catch (error) {
    console.error('Error fetching notes:', error);
    return { success: false, error: 'Failed to fetch notes' };
  }
}
