import { and, eq, memberNotes, type TenantTransaction } from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { ROLES } from '@interdomestik/shared-auth';

import { canActOnMemberNotes, type MemberNoteActor } from './access';
import {
  admit,
  fail,
  ok,
  selectNotesWithAuthor,
  type DeletedNoteAudit,
  type MemberNoteCommandParams,
  type MemberNoteResult,
  type PinnedNoteAudit,
  type UpdatedNoteAudit,
} from './result';
import {
  mapNoteRow,
  noteIdSchema,
  sanitizeNoteContent,
  updateNoteSchema,
  type MemberNote,
} from './schema';

// Changing an existing note: update, delete and pin, each on the note locked after its member and
// the actor's assignment (see lockAccessibleNote).

type LockedNote = { id: string; memberId: string; authorId: string; isPinned: boolean };

/**
 * The note row, locked FOR UPDATE, when the actor may act on its member; otherwise null. The lock
 * order is member, assignment, note: the same as a member deletion, which cascades from the user
 * row into the notes. A note that is unknown, foreign, on an inaccessible or non-member target, or
 * gone or moved before the lock, is one answer: null (NOT_FOUND to the caller).
 */
async function lockAccessibleNote(
  tx: TenantTransaction,
  actor: MemberNoteActor,
  noteId: string
): Promise<LockedNote | null> {
  const [found] = await tx
    .select({ memberId: memberNotes.memberId })
    .from(memberNotes)
    .where(and(eq(memberNotes.id, noteId), eq(memberNotes.tenantId, actor.tenantId)))
    .limit(1);
  if (!found) return null;
  if (!(await canActOnMemberNotes(tx, actor, found.memberId))) return null;
  const [locked] = await tx
    .select({
      id: memberNotes.id,
      memberId: memberNotes.memberId,
      authorId: memberNotes.authorId,
      isPinned: memberNotes.isPinned,
    })
    .from(memberNotes)
    .where(
      and(
        eq(memberNotes.id, noteId),
        eq(memberNotes.tenantId, actor.tenantId),
        eq(memberNotes.memberId, found.memberId)
      )
    )
    .for('update');
  return locked ?? null;
}

/** As on base: the author edits or deletes a note, and an admin any note. */
function mayChange(actor: MemberNoteActor, note: LockedNote): boolean {
  return note.authorId === actor.userId || actor.role === ROLES.admin;
}

/** Updates a note the actor wrote (or any, for an admin) on a member it may act on. */
export async function updateMemberNote(
  params: MemberNoteCommandParams
): Promise<MemberNoteResult<MemberNote, UpdatedNoteAudit>> {
  const admitted = admit(params, updateNoteSchema);
  if ('ok' in admitted) return admitted;
  const { actor, input } = admitted;

  let content: string | undefined;
  if (input.content !== undefined) {
    content = sanitizeNoteContent(input.content);
    // Deliberate: content that is empty once sanitized is refused, never stored.
    if (!content) return fail('EMPTY_CONTENT');
  }
  // Each column named on its own from the parsed input; an absent field is undefined, which the
  // update leaves unchanged (followUpDate: null clears the date).
  const values = {
    type: input.type,
    content,
    isPinned: input.isPinned,
    isInternal: input.isInternal,
    followUpDate: input.followUpDate,
  };
  const updatedFields = Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([field]) => field);

  // db-access-guard: tenant-scoped -- reason: tenantId from the session-bound authority actor
  return withTenantAuthority(params.authority, async tx => {
    const note = await lockAccessibleNote(tx, actor, input.id);
    if (!note) return fail('NOT_FOUND');
    if (!mayChange(actor, note)) return fail('NOT_AUTHOR');
    await tx
      .update(memberNotes)
      .set({
        type: values.type,
        content: values.content,
        isPinned: values.isPinned,
        isInternal: values.isInternal,
        followUpDate: values.followUpDate,
        updatedAt: new Date(),
      })
      .where(and(eq(memberNotes.id, note.id), eq(memberNotes.tenantId, actor.tenantId)));
    const [updated] = await selectNotesWithAuthor(tx)
      .where(and(eq(memberNotes.id, note.id), eq(memberNotes.tenantId, actor.tenantId)))
      .limit(1);
    if (!updated) return fail('NOT_FOUND');
    return ok(mapNoteRow(updated), { memberId: note.memberId, updatedFields });
  });
}

/** Deletes a note the actor wrote (or any, for an admin) on a member it may act on. */
export async function deleteMemberNote(
  params: MemberNoteCommandParams
): Promise<MemberNoteResult<undefined, DeletedNoteAudit>> {
  const admitted = admit(params, noteIdSchema);
  if ('ok' in admitted) return admitted;
  const { actor, input } = admitted;

  // db-access-guard: tenant-scoped -- reason: tenantId from the session-bound authority actor
  return withTenantAuthority(params.authority, async tx => {
    const note = await lockAccessibleNote(tx, actor, input.noteId);
    if (!note) return fail('NOT_FOUND');
    if (!mayChange(actor, note)) return fail('NOT_AUTHOR');
    await tx
      .delete(memberNotes)
      .where(and(eq(memberNotes.id, note.id), eq(memberNotes.tenantId, actor.tenantId)));
    return ok(undefined, { memberId: note.memberId });
  });
}

/**
 * The pin toggle inside a transaction the caller holds: any actor that may act on the note's
 * member may pin it (as on base). The row is locked, so concurrent toggles never lose an update.
 * Exported for the restricted-role proof only; entry points call `toggleMemberNotePin`.
 */
export async function toggleMemberNotePinIn(
  tx: TenantTransaction,
  actor: MemberNoteActor,
  noteId: string
): Promise<MemberNoteResult<{ isPinned: boolean }, PinnedNoteAudit>> {
  const note = await lockAccessibleNote(tx, actor, noteId);
  if (!note) return fail('NOT_FOUND');
  const isPinned = !note.isPinned;
  await tx
    .update(memberNotes)
    .set({ isPinned, updatedAt: new Date() })
    .where(and(eq(memberNotes.id, note.id), eq(memberNotes.tenantId, actor.tenantId)));
  return ok({ isPinned }, { memberId: note.memberId, isPinned });
}

/** Toggles a note's pin. */
export async function toggleMemberNotePin(
  params: MemberNoteCommandParams
): Promise<MemberNoteResult<{ isPinned: boolean }, PinnedNoteAudit>> {
  const admitted = admit(params, noteIdSchema);
  if ('ok' in admitted) return admitted;
  const { actor, input } = admitted;
  // db-access-guard: tenant-scoped -- reason: tenantId from the session-bound authority actor
  return withTenantAuthority(params.authority, tx =>
    toggleMemberNotePinIn(tx, actor, input.noteId)
  );
}
