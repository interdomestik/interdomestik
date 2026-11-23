import { and, desc, eq, memberNotes } from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { nanoid } from 'nanoid';

import { canActOnMemberNotes, memberNoteScope } from './access';
import {
  admit,
  fail,
  ok,
  selectNotesWithAuthor,
  type CreatedNoteAudit,
  type MemberNoteCommandParams,
  type MemberNoteResult,
} from './result';
import {
  createNoteSchema,
  listNotesSchema,
  mapNoteRow,
  sanitizeNoteContent,
  type MemberNote,
} from './schema';

// Reading and creating notes. Changing an existing note (update, delete, pin) is in ./change.

/** Lists a member's notes, pinned first, newest first. */
export async function listMemberNotes(
  params: MemberNoteCommandParams
): Promise<MemberNoteResult<MemberNote[]>> {
  const admitted = admit(params, listNotesSchema);
  if ('ok' in admitted) return admitted;
  const { actor, input } = admitted;

  // db-access-guard: tenant-scoped -- reason: tenantId from the session-bound authority actor
  return withTenantAuthority(params.authority, async tx => {
    if (!(await canActOnMemberNotes(tx, actor, input.memberId))) {
      // Tenant-wide readers keep the base answer for a missing target: an empty list, so a
      // foreign, unknown or non-member id looks like a member with no notes.
      return memberNoteScope(actor.role) === 'tenant' ? ok([], null) : fail('FORBIDDEN');
    }
    const rows = await selectNotesWithAuthor(tx)
      .where(
        and(eq(memberNotes.tenantId, actor.tenantId), eq(memberNotes.memberId, input.memberId))
      )
      .orderBy(desc(memberNotes.isPinned), desc(memberNotes.createdAt));
    return ok(rows.map(mapNoteRow), null);
  });
}

/** Creates a note on a member the actor may act on; tenant and author come from the actor. */
export async function createMemberNote(
  params: MemberNoteCommandParams
): Promise<MemberNoteResult<MemberNote, CreatedNoteAudit>> {
  const admitted = admit(params, createNoteSchema);
  if ('ok' in admitted) return admitted;
  const { actor, input } = admitted;
  const content = sanitizeNoteContent(input.content);
  if (!content) return fail('EMPTY_CONTENT');

  // db-access-guard: tenant-scoped -- reason: tenantId from the session-bound authority actor
  return withTenantAuthority(params.authority, async tx => {
    // One refusal for an unknown, foreign, non-member or out-of-scope target; nothing is inserted.
    if (!(await canActOnMemberNotes(tx, actor, input.memberId))) return fail('FORBIDDEN');
    const note = {
      id: nanoid(),
      tenantId: actor.tenantId,
      memberId: input.memberId,
      authorId: actor.userId,
      type: input.type ?? 'general',
      content,
      isPinned: input.isPinned ?? false,
      isInternal: input.isInternal ?? true,
      followUpDate: input.followUpDate ?? null,
      createdAt: new Date(),
      updatedAt: null,
    };
    await tx.insert(memberNotes).values(note);
    const created: MemberNote = {
      id: note.id,
      memberId: note.memberId,
      authorId: note.authorId,
      authorName: params.session.user.name ?? 'Unknown',
      type: note.type,
      content: note.content,
      isPinned: note.isPinned,
      isInternal: note.isInternal,
      followUpDate: note.followUpDate,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
    return ok(created, {
      memberId: note.memberId,
      noteType: note.type,
      isPinned: note.isPinned,
      isInternal: note.isInternal,
    });
  });
}
