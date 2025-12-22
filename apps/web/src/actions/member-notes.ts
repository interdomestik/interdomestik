'use server';

import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { memberNotes, user as userTable } from '@interdomestik/database/schema';
import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';

import {
  ActionResult,
  CreateNoteInput,
  createNoteSchema,
  MemberNote,
  NoteType,
  UpdateNoteInput,
  updateNoteSchema,
} from './member-notes.types';

// Re-export types for consumers
export type { MemberNote, NoteType } from './member-notes.types';

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

function canAccessNotes(role: string): boolean {
  return ['agent', 'staff', 'admin'].includes(role);
}

function mapNoteRow(row: {
  id: string;
  memberId: string;
  authorId: string;
  authorName: string | null;
  type: string | null;
  content: string;
  isPinned: boolean;
  isInternal: boolean;
  followUpDate: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}): MemberNote {
  return {
    ...row,
    authorName: row.authorName ?? 'Unknown',
    type: (row.type ?? 'general') as NoteType,
  };
}

/** Get all notes for a member */
export async function getMemberNotes(memberId: string): Promise<ActionResult<MemberNote[]>> {
  const session = await getSession();
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canAccessNotes(session.user.role)) return { success: false, error: 'Access denied' };

  try {
    const rows = await db
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
      .where(eq(memberNotes.memberId, memberId))
      .orderBy(desc(memberNotes.isPinned), desc(memberNotes.createdAt));

    return { success: true, data: rows.map(mapNoteRow) };
  } catch (error) {
    console.error('Error fetching notes:', error);
    return { success: false, error: 'Failed to fetch notes' };
  }
}

/** Create a new note for a member */
export async function createMemberNote(data: CreateNoteInput): Promise<ActionResult<MemberNote>> {
  const session = await getSession();
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canAccessNotes(session.user.role)) return { success: false, error: 'Access denied' };

  const validated = createNoteSchema.safeParse(data);
  if (!validated.success) return { success: false, error: validated.error.message };

  try {
    const newNote = {
      id: nanoid(),
      memberId: validated.data.memberId,
      authorId: session.user.id,
      type: validated.data.type ?? 'general',
      content: validated.data.content,
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

/** Update an existing note */
export async function updateMemberNote(data: UpdateNoteInput): Promise<ActionResult<MemberNote>> {
  const session = await getSession();
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canAccessNotes(session.user.role)) return { success: false, error: 'Access denied' };

  const validated = updateNoteSchema.safeParse(data);
  if (!validated.success) return { success: false, error: validated.error.message };

  try {
    const [existing] = await db
      .select()
      .from(memberNotes)
      .where(eq(memberNotes.id, validated.data.id))
      .limit(1);
    if (!existing) return { success: false, error: 'Note not found' };
    if (existing.authorId !== session.user.id && session.user.role !== 'admin') {
      return { success: false, error: 'You can only edit your own notes' };
    }

    const updateData: Record<string, unknown> = {};
    if (validated.data.type !== undefined) updateData.type = validated.data.type;
    if (validated.data.content !== undefined) updateData.content = validated.data.content;
    if (validated.data.isPinned !== undefined) updateData.isPinned = validated.data.isPinned;
    if (validated.data.isInternal !== undefined) updateData.isInternal = validated.data.isInternal;
    if (validated.data.followUpDate !== undefined)
      updateData.followUpDate = validated.data.followUpDate;

    await db.update(memberNotes).set(updateData).where(eq(memberNotes.id, validated.data.id));

    const [updated] = await db
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
      .where(eq(memberNotes.id, validated.data.id))
      .limit(1);

    return { success: true, data: mapNoteRow(updated) };
  } catch (error) {
    console.error('Error updating note:', error);
    return { success: false, error: 'Failed to update note' };
  }
}

/** Delete a note */
export async function deleteMemberNote(noteId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canAccessNotes(session.user.role)) return { success: false, error: 'Access denied' };

  try {
    const [existing] = await db
      .select()
      .from(memberNotes)
      .where(eq(memberNotes.id, noteId))
      .limit(1);
    if (!existing) return { success: false, error: 'Note not found' };
    if (existing.authorId !== session.user.id && session.user.role !== 'admin') {
      return { success: false, error: 'You can only delete your own notes' };
    }

    await db.delete(memberNotes).where(eq(memberNotes.id, noteId));
    return { success: true };
  } catch (error) {
    console.error('Error deleting note:', error);
    return { success: false, error: 'Failed to delete note' };
  }
}

/** Toggle pin status of a note */
export async function toggleNotePin(noteId: string): Promise<ActionResult<{ isPinned: boolean }>> {
  const session = await getSession();
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canAccessNotes(session.user.role)) return { success: false, error: 'Access denied' };

  try {
    const [existing] = await db
      .select()
      .from(memberNotes)
      .where(eq(memberNotes.id, noteId))
      .limit(1);
    if (!existing) return { success: false, error: 'Note not found' };

    const newPinned = !existing.isPinned;
    await db.update(memberNotes).set({ isPinned: newPinned }).where(eq(memberNotes.id, noteId));
    return { success: true, data: { isPinned: newPinned } };
  } catch (error) {
    console.error('Error toggling pin:', error);
    return { success: false, error: 'Failed to toggle pin' };
  }
}
