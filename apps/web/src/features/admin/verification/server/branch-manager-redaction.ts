import { deniesClaimDocumentContent } from '@/app/api/documents/branch-manager-document-boundary';
import type { RoleLike } from '@/lib/roles.core';
import type { CashVerificationDetailsDTO, CashVerificationRequestDTO } from './types';

/** D1: redact only at the client boundary; keep tenant-scoped query results intact. */
export function redactVerificationRequestsForRole(
  requests: CashVerificationRequestDTO[],
  role: RoleLike
): CashVerificationRequestDTO[] {
  if (!deniesClaimDocumentContent(role)) return requests;

  return requests.map(request => ({ ...request, documentId: null, documentPath: null }));
}

export function redactVerificationDetailsForRole(
  details: CashVerificationDetailsDTO | null,
  role: RoleLike
): CashVerificationDetailsDTO | null {
  if (!details || !deniesClaimDocumentContent(role)) return details;

  return {
    ...details,
    documentId: null,
    documentPath: null,
    documents: [],
    timeline: details.timeline.map((event, index) =>
      event.type === 'document_upload'
        ? {
            ...event,
            // Raw event IDs embed document IDs. Preserve only a neutral list key.
            id: `document-upload-${index}`,
            description: undefined,
          }
        : event
    ),
  };
}
