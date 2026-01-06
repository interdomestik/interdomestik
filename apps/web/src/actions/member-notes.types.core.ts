import { z } from 'zod';

export const noteTypeSchema = z.enum(['call', 'meeting', 'email', 'general', 'follow_up', 'issue']);

/** Maximum content length for member notes */
export const MAX_NOTE_CONTENT_LENGTH = 2000;

/** Sanitize note content - strip HTML and limit length */
export function sanitizeNoteContent(content: string): string {
  // Strip any HTML tags (whitelist: plain text only)
  const plainText = content.replaceAll(/<[^>]*>/g, '');
  // Trim and limit to max length
  return plainText.trim().slice(0, MAX_NOTE_CONTENT_LENGTH);
}

export const createNoteSchema = z.object({
  memberId: z.string().min(1),
  type: noteTypeSchema.optional(),
  content: z.string().min(1).max(MAX_NOTE_CONTENT_LENGTH),
  isPinned: z.boolean().optional(),
  isInternal: z.boolean().optional(),
  followUpDate: z.date().optional(),
});

export const updateNoteSchema = z.object({
  id: z.string().min(1),
  type: noteTypeSchema.optional(),
  content: z.string().min(1).max(MAX_NOTE_CONTENT_LENGTH).optional(),
  isPinned: z.boolean().optional(),
  isInternal: z.boolean().optional(),
  followUpDate: z.date().nullable().optional(),
});

export type NoteType = z.infer<typeof noteTypeSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

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

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}
