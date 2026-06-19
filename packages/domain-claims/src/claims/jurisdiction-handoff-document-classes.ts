import type { CaseScopedAccessDocumentClass } from '@interdomestik/database';

export const HANDOFF_DOCUMENT_CLASSES = [
  'correspondence',
  'contract',
  'evidence',
  'legal',
  'receipt',
] as const satisfies readonly CaseScopedAccessDocumentClass[];
