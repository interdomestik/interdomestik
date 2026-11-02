import { memberNotes } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import type { ActionResult } from '../member-notes.types';
import { logAuditEvent } from '@/lib/audit';
import { canAccessNotes } from './access';
import type { Session } from './context';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function deleteMemberNoteCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  noteId: string;
}): Promise<ActionResult> {
  const { session, authority, noteId } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canAccessNotes(session.user.role)) return { success: false, error: 'Access denied' };

  try {
    ensureTenantId(session);
  } catch {
    return { success: false, error: 'Missing tenantId' };
  }
  if (!authority) return { success: false, error: 'Unauthorized' };
  const { tenantId } = readTenantAuthority(authority);

  try {
    // SECURITY: Tenant scoping on lookup
    const [existing] = await withTenantAuthority(authority, async tx =>
      tx
        .select()
        .from(memberNotes)
        .where(and(eq(memberNotes.id, noteId), eq(memberNotes.tenantId, tenantId)))
        .limit(1)
    );
    if (!existing) return { success: false, error: 'Note not found' };
    if (existing.authorId !== session.user.id && session.user.role !== 'admin') {
      return { success: false, error: 'You can only delete your own notes' };
    }

    await withTenantAuthority(authority, async tx =>
      tx
        .delete(memberNotes)
        .where(and(eq(memberNotes.id, noteId), eq(memberNotes.tenantId, tenantId)))
    );

    await logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      authority,
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
