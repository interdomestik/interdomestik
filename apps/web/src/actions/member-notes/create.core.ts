import { memberNotes } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { nanoid } from 'nanoid';
import type { ActionResult, CreateNoteInput, MemberNote, NoteType } from '../member-notes.types';
import { createNoteSchema, sanitizeNoteContent } from '../member-notes.types';
import { logAuditEvent } from '@/lib/audit';
import { canAccessNotes } from './access';
import type { Session } from './context';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function createMemberNoteCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  data: CreateNoteInput;
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

  const validated = createNoteSchema.safeParse(data);
  if (!validated.success) return { success: false, error: validated.error.message };

  try {
    // SECURITY: Sanitize content - strip HTML and limit length
    const sanitizedContent = sanitizeNoteContent(validated.data.content);
    if (!sanitizedContent) {
      return { success: false, error: 'Content cannot be empty' };
    }

    const newNote = {
      id: nanoid(),
      tenantId,
      memberId: validated.data.memberId,
      authorId: session.user.id,
      type: validated.data.type ?? 'general',
      content: sanitizedContent, // Use sanitized content

      isPinned: validated.data.isPinned ?? false,
      isInternal: validated.data.isInternal ?? true,
      followUpDate: validated.data.followUpDate ?? null,
      createdAt: new Date(),
      updatedAt: null,
    };

    // db-access-guard: tenant-scoped -- reason: tenantId from validated session before member note insert
    await withTenantAuthority(authority, async tx => await tx.insert(memberNotes).values(newNote));

    await logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      authority,
      action: 'member_note.created',
      entityType: 'member_note',
      entityId: newNote.id,
      metadata: {
        memberId: newNote.memberId,
        noteType: newNote.type,
        isPinned: newNote.isPinned,
        isInternal: newNote.isInternal,
      },
    });

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
