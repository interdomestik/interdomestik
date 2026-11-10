import { deniesClaimDocumentContent } from '@/app/api/documents/branch-manager-document-boundary';
import { isStaffOrAdmin } from '@/lib/roles.core';

export function isAdminUploadRole(role: string | null | undefined): boolean {
  return !deniesClaimDocumentContent(role) && isStaffOrAdmin(role);
}
