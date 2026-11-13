/** Reader-facing file kinds; each one has a `documents.fileTypes.<kind>` label in every locale. */
export type DocumentFileKind =
  'pdf' | 'word' | 'excel' | 'image' | 'audio' | 'video' | 'email' | 'file';

const EXACT_MIME_KINDS: Readonly<Record<string, DocumentFileKind>> = {
  'application/pdf': 'pdf',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'message/rfc822': 'email',
  'application/vnd.ms-outlook': 'email',
};

const MIME_FAMILY_KINDS: Readonly<Record<string, DocumentFileKind>> = {
  image: 'image',
  audio: 'audio',
  video: 'video',
};

/** Maps a stored MIME type (never shown raw) to a readable file kind; unknown types are "file". */
export function documentFileKind(mimeType: string | null | undefined): DocumentFileKind {
  const normalized = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  const exact = EXACT_MIME_KINDS[normalized];
  if (exact) return exact;
  const family = normalized.split('/')[0];
  return MIME_FAMILY_KINDS[family] ?? 'file';
}
