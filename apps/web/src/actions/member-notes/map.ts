import type { MemberNote, NoteType } from '../member-notes.types';

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
