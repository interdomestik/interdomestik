import { db } from '@interdomestik/database';
import { memberNotes } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import type { ActionResult } from '../member-notes.types';
import { logAuditEvent } from '@/lib/audit';
import { canAccessNotes } from './access';
import type { Session } from './context';

export async function deleteMemberNoteCore(params: {
  session: NonNullable<Session> | null;
  noteId: string;
}): Promise<ActionResult> {
  const { session, noteId } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canAccessNotes(session.user.role)) return { success: false, error: 'Access denied' };

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return { success: false, error: 'Missing tenantId' };
  }

  try {
    // SECURITY: Tenant scoping on lookup
    const [existing] = await db
      .select()
      .from(memberNotes)
      .where(and(eq(memberNotes.id, noteId), eq(memberNotes.tenantId, tenantId)))
      .limit(1);
    if (!existing) return { success: false, error: 'Note not found' };
    if (existing.authorId !== session.user.id && session.user.role !== 'admin') {
      return { success: false, error: 'You can only delete your own notes' };
    }

    await db
      .delete(memberNotes)
      .where(and(eq(memberNotes.id, noteId), eq(memberNotes.tenantId, tenantId)));

    await logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      tenantId,
      action: 'member_note.deleted',
      entityType: 'member_note',
      entityId: noteId,
      metadata: { memberId: existing.memberId },
    });
    return { success: true };
  } catch (error) {
    console.error('Error deleting note:', error);
    return { success: false, error: 'Failed to delete note' };
  }
}
