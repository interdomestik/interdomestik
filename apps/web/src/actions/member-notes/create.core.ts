import { db } from '@interdomestik/database';
import { memberNotes } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { nanoid } from 'nanoid';
import type { ActionResult, CreateNoteInput, MemberNote, NoteType } from '../member-notes.types';
import { createNoteSchema, sanitizeNoteContent } from '../member-notes.types';
import { canAccessNotes } from './access';
import type { Session } from './context';

export async function createMemberNoteCore(params: {
  session: NonNullable<Session> | null;
  data: CreateNoteInput;
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
