import { z } from 'zod';

export const noteTypeSchema = z.enum(['call', 'meeting', 'email', 'general', 'follow_up', 'issue']);

/** Maximum content length for member notes */
export const MAX_NOTE_CONTENT_LENGTH = 2000;

/** Sanitize note content - strip HTML and limit length */
export function sanitizeNoteContent(content: string): string {
  return stripHtmlTags(content).trim().slice(0, MAX_NOTE_CONTENT_LENGTH);
}

function stripHtmlTags(content: string): string {
  const plainText: string[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    const char = content[cursor] ?? '';
    if (char !== '<') {
      plainText.push(char);
      cursor += 1;
      continue;
    }
    const tagEnd = content.indexOf('>', cursor + 1);
    if (tagEnd === -1) {
      plainText.push(char);
      cursor += 1;
    } else {
      cursor = tagEnd + 1;
    }
  }
  return plainText.join('');
}

// Every input is strict: a key the command does not name (tenantId, authorId, agentId, ...) is
// refused, never stripped. Identity and tenant come from the authority, never from input.

export const listNotesSchema = z.strictObject({
  memberId: z.string().min(1),
});

export const createNoteSchema = z.strictObject({
  memberId: z.string().min(1),
  type: noteTypeSchema.optional(),
  content: z.string().min(1).max(MAX_NOTE_CONTENT_LENGTH),
  isPinned: z.boolean().optional(),
  isInternal: z.boolean().optional(),
  followUpDate: z.date().optional(),
});

export const updateNoteSchema = z.strictObject({
  id: z.string().min(1),
  type: noteTypeSchema.optional(),
  content: z.string().min(1).max(MAX_NOTE_CONTENT_LENGTH).optional(),
  isPinned: z.boolean().optional(),
  isInternal: z.boolean().optional(),
  followUpDate: z.date().nullable().optional(),
});

export const noteIdSchema = z.strictObject({
  noteId: z.string().min(1),
});

export type NoteType = z.infer<typeof noteTypeSchema>;
export type ListNotesInput = z.infer<typeof listNotesSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type NoteIdInput = z.infer<typeof noteIdSchema>;

export interface MemberNote {
  id: string;
  memberId: string;
  authorId: string;
  authorName: string;
  type: NoteType;
  content: string;
  isPinned: boolean;
  isInternal: boolean;
  followUpDate: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export function mapNoteRow(row: {
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
