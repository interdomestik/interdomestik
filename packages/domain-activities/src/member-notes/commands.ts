import { and, desc, eq, memberNotes, user, type TenantTransaction } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { ROLES } from '@interdomestik/shared-auth';
import { nanoid } from 'nanoid';
import type { z } from 'zod';

import {
  canActOnMemberNotes,
  memberNoteActorOf,
  memberNoteScope,
  type MemberNoteActor,
  type MemberNoteSession,
} from './access';
import {
  createNoteSchema,
  listNotesSchema,
  mapNoteRow,
  noteIdSchema,
  sanitizeNoteContent,
  updateNoteSchema,
  type MemberNote,
  type NoteType,
} from './schema';

export type MemberNoteFailureCode =
  'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'EMPTY_CONTENT' | 'NOT_FOUND' | 'NOT_AUTHOR';

export type MemberNoteFailure = Readonly<{
  ok: false;
  code: MemberNoteFailureCode;
  message?: string;
}>;

/** `audit` carries what the entry point records after a committed write, read from the locked row. */
export type MemberNoteResult<T, A = null> =
  Readonly<{ ok: true; data: T; audit: A }> | MemberNoteFailure;

export type MemberNoteCommandParams = {
  session: MemberNoteSession & { user: { name?: string | null } };
  authority: TenantAuthority;
  input: unknown;
};

export type CreatedNoteAudit = {
  memberId: string;
  noteType: NoteType;
  isPinned: boolean;
  isInternal: boolean;
};
export type UpdatedNoteAudit = { memberId: string; updatedFields: string[] };
export type DeletedNoteAudit = { memberId: string };
export type PinnedNoteAudit = { memberId: string; isPinned: boolean };

const fail = (code: MemberNoteFailureCode, message?: string): MemberNoteFailure =>
  Object.freeze(message === undefined ? { ok: false, code } : { ok: false, code, message });

const ok = <T, A>(data: T, audit: A) => Object.freeze({ ok: true as const, data, audit });

/**
 * Before any database access: the actor bound to its session (UNAUTHORIZED), the role scope
 * (FORBIDDEN), then the strict input (INVALID_INPUT).
 */
function admit<S extends z.ZodType>(
  params: MemberNoteCommandParams,
  schema: S
): MemberNoteFailure | { actor: MemberNoteActor; input: z.output<S> } {
  const actor = memberNoteActorOf(params.session, params.authority);
  if (!actor) return fail('UNAUTHORIZED');
  if (memberNoteScope(actor.role) === 'denied') return fail('FORBIDDEN');
  const parsed = schema.safeParse(params.input);
  if (!parsed.success) return fail('INVALID_INPUT', parsed.error.message);
  return { actor, input: parsed.data };
}

function selectNotesWithAuthor(tx: TenantTransaction) {
  return tx
    .select({
      id: memberNotes.id,
      memberId: memberNotes.memberId,
      authorId: memberNotes.authorId,
      authorName: user.name,
      type: memberNotes.type,
      content: memberNotes.content,
      isPinned: memberNotes.isPinned,
      isInternal: memberNotes.isInternal,
      followUpDate: memberNotes.followUpDate,
      createdAt: memberNotes.createdAt,
      updatedAt: memberNotes.updatedAt,
    })
    .from(memberNotes)
    .leftJoin(user, eq(memberNotes.authorId, user.id));
}

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

type NoteChanges = Partial<
  Pick<
    typeof memberNotes.$inferInsert,
    'type' | 'content' | 'isPinned' | 'isInternal' | 'followUpDate' | 'updatedAt'
  >
>;

/** Updates a note the actor wrote (or any, for an admin) on a member it may act on. */
export async function updateMemberNote(
  params: MemberNoteCommandParams
): Promise<MemberNoteResult<MemberNote, UpdatedNoteAudit>> {
  const admitted = admit(params, updateNoteSchema);
  if ('ok' in admitted) return admitted;
  const { actor, input } = admitted;

  const changes: NoteChanges = {};
  if (input.type !== undefined) changes.type = input.type;
  if (input.content !== undefined) {
    const content = sanitizeNoteContent(input.content);
    // Deliberate: content that is empty once sanitized is refused, never stored.
    if (!content) return fail('EMPTY_CONTENT');
    changes.content = content;
  }
  if (input.isPinned !== undefined) changes.isPinned = input.isPinned;
  if (input.isInternal !== undefined) changes.isInternal = input.isInternal;
  if (input.followUpDate !== undefined) changes.followUpDate = input.followUpDate;
  const updatedFields = Object.keys(changes);

  // db-access-guard: tenant-scoped -- reason: tenantId from the session-bound authority actor
  return withTenantAuthority(params.authority, async tx => {
    const note = await lockAccessibleNote(tx, actor, input.id);
    if (!note) return fail('NOT_FOUND');
    if (!mayChange(actor, note)) return fail('NOT_AUTHOR');
    await tx
      .update(memberNotes)
      .set({ ...changes, updatedAt: new Date() })
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
