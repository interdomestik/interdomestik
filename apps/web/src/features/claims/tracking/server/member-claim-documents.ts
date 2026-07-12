import type { ClaimTrackingDocument } from '../types';

interface MemberClaimDocumentSource {
  id: string;
  name: string;
  category: string;
  createdAt: Date | null;
  fileType: string;
  fileSize: number;
}

export function mapMemberClaimDocuments(
  documents: MemberClaimDocumentSource[]
): ClaimTrackingDocument[] {
  return documents.map(document => ({
    id: document.id,
    name: document.name,
    category: document.category,
    createdAt: document.createdAt ?? new Date(),
    fileType: document.fileType,
    fileSize: document.fileSize,
  }));
}
