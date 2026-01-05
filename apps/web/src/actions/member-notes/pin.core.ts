import { db } from '@interdomestik/database';
import { memberNotes } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import type { ActionResult } from '../member-notes.types';
import { logAuditEvent } from '@/lib/audit';
import { canAccessNotes } from './access';
import type { Session } from './context';

export async function toggleNotePinCore(params: {
  session: NonNullable<Session> | null;
  noteId: string;
}): Promise<ActionResult<{ isPinned: boolean }>> {
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

    const newPinned = !existing.isPinned;
    await db
      .update(memberNotes)
      .set({ isPinned: newPinned, updatedAt: new Date() })
      .where(and(eq(memberNotes.id, noteId), eq(memberNotes.tenantId, tenantId)));

    await logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      tenantId,
      action: 'member_note.pin_toggled',
      entityType: 'member_note',
      entityId: noteId,
      metadata: { memberId: existing.memberId, isPinned: newPinned },
    });
    return { success: true, data: { isPinned: newPinned } };
  } catch (error) {
    console.error('Error toggling pin:', error);
    return { success: false, error: 'Failed to toggle pin' };
  }
}
