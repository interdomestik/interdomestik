import { db } from '@interdomestik/database';
import { memberNotes, user as userTable } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import type { ActionResult, MemberNote, UpdateNoteInput } from '../member-notes.types';
import { sanitizeNoteContent, updateNoteSchema } from '../member-notes.types';
import { canAccessNotes } from './access';
import type { Session } from './context';
import { mapNoteRow } from './map';

export async function updateMemberNoteCore(params: {
  session: NonNullable<Session> | null;
  data: UpdateNoteInput;
}): Promise<ActionResult<MemberNote>> {
  const { session, data } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canAccessNotes(session.user.role)) return { success: false, error: 'Access denied' };

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return { success: false, error: 'Missing tenantId' };
  }

  const validated = updateNoteSchema.safeParse(data);
  if (!validated.success) return { success: false, error: validated.error.message };

  try {
    // SECURITY: Tenant scoping on lookup
    const [existing] = await db
      .select()
      .from(memberNotes)
      .where(and(eq(memberNotes.id, validated.data.id), eq(memberNotes.tenantId, tenantId)))
      .limit(1);
    if (!existing) return { success: false, error: 'Note not found' };
    if (existing.authorId !== session.user.id && session.user.role !== 'admin') {
      return { success: false, error: 'You can only edit your own notes' };
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (validated.data.type !== undefined) updateData.type = validated.data.type;
    if (validated.data.content !== undefined) {
      // SECURITY: Sanitize content
      updateData.content = sanitizeNoteContent(validated.data.content);
    }
    if (validated.data.isPinned !== undefined) updateData.isPinned = validated.data.isPinned;
    if (validated.data.isInternal !== undefined) updateData.isInternal = validated.data.isInternal;
    if (validated.data.followUpDate !== undefined)
      updateData.followUpDate = validated.data.followUpDate;

    await db
      .update(memberNotes)
      .set(updateData)
      .where(and(eq(memberNotes.id, validated.data.id), eq(memberNotes.tenantId, tenantId)));

    const [updated] = await db
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
      .where(eq(memberNotes.id, validated.data.id))
      .limit(1);

    return { success: true, data: mapNoteRow(updated) };
  } catch (error) {
    console.error('Error updating note:', error);
    return { success: false, error: 'Failed to update note' };
  }
}
