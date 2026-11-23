import { eq, memberNotes, user, type TenantTransaction } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { z } from 'zod';

import {
  memberNoteActorOf,
  memberNoteScope,
  type MemberNoteActor,
  type MemberNoteSession,
} from './access';
import type { NoteType } from './schema';

// The result types and the admission every member-note command runs first.

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

export const fail = (code: MemberNoteFailureCode, message?: string): MemberNoteFailure =>
  Object.freeze(message === undefined ? { ok: false, code } : { ok: false, code, message });

export const ok = <T, A>(data: T, audit: A) => Object.freeze({ ok: true as const, data, audit });

/**
 * Before any database access: the actor bound to its session (UNAUTHORIZED), the role scope
 * (FORBIDDEN), then the strict input (INVALID_INPUT).
 */
export function admit<S extends z.ZodType>(
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

export function selectNotesWithAuthor(tx: TenantTransaction) {
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
