import { memberNotes, user as userTable } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import type { ActionResult, MemberNote, UpdateNoteInput } from '../member-notes.types';
import { sanitizeNoteContent, updateNoteSchema } from '../member-notes.types';
import { logAuditEvent } from '@/lib/audit';
import { canAccessNotes } from './access';
import type { Session } from './context';
import { mapNoteRow } from './map';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function updateMemberNoteCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  data: UpdateNoteInput;
}): Promise<ActionResult<MemberNote>> {
  const { session, authority, data } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canAccessNotes(session.user.role)) return { success: false, error: 'Access denied' };

  try {
    ensureTenantId(session);
  } catch {
    return { success: false, error: 'Missing tenantId' };
  }
  if (!authority) return { success: false, error: 'Unauthorized' };
  const { tenantId } = readTenantAuthority(authority);

  const validated = updateNoteSchema.safeParse(data);
  if (!validated.success) return { success: false, error: validated.error.message };

  try {
    // SECURITY: Tenant scoping on lookup
    const [existing] = await withTenantAuthority(authority, async tx =>
      tx
        .select()
        .from(memberNotes)
        .where(and(eq(memberNotes.id, validated.data.id), eq(memberNotes.tenantId, tenantId)))
        .limit(1)
    );
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

    await withTenantAuthority(authority, async tx =>
      tx
        .update(memberNotes)
        .set(updateData)
        .where(and(eq(memberNotes.id, validated.data.id), eq(memberNotes.tenantId, tenantId)))
    );

    const updatedFields = Object.keys(updateData).filter(key => key !== 'updatedAt');
    await logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      authority,
      action: 'member_note.updated',
      entityType: 'member_note',
      entityId: validated.data.id,
      metadata: {
        memberId: existing.memberId,
        updatedFields,
      },
    });

    const [updated] = await withTenantAuthority(authority, async tx =>
      tx
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
        .where(and(eq(memberNotes.id, validated.data.id), eq(memberNotes.tenantId, tenantId)))
        .limit(1)
    );

    return { success: true, data: mapNoteRow(updated) };
  } catch (error) {
    console.error('Error updating note:', error);
    return { success: false, error: 'Failed to update note' };
  }
}
