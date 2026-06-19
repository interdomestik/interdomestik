import type { CaseScopedDocumentClass } from '@interdomestik/shared-auth';

const APPROVED_DURABLE_DOCUMENT_CLASSES = new Set<CaseScopedDocumentClass>([
  'correspondence',
  'contract',
  'evidence',
  'legal',
  'receipt',
]);

export function toApprovedDurableDocumentClass(value: unknown): CaseScopedDocumentClass | null {
  if (typeof value !== 'string') return null;
  return APPROVED_DURABLE_DOCUMENT_CLASSES.has(value as CaseScopedDocumentClass)
    ? (value as CaseScopedDocumentClass)
    : null;
}
