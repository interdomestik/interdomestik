import { nanoid } from 'nanoid';

type ClaimFileInput = {
  name: string;
  path: string;
  type: string;
  size: number;
  bucket: string;
  classification?: string;
};

export function buildClaimDocumentRows(params: {
  claimId: string;
  uploadedBy: string;
  files: ClaimFileInput[];
  tenantId?: string | null;
}) {
  const { claimId, uploadedBy, files, tenantId } = params;
  const resolvedTenantId = tenantId ?? 'tenant_mk';

  return files.map(file => ({
    id: nanoid(),
    tenantId: resolvedTenantId,
    claimId,
    name: file.name,
    filePath: file.path,
    fileType: file.type,
    fileSize: file.size,
    bucket: file.bucket,
    classification: file.classification || 'pii',
    category: 'evidence' as const,
    uploadedBy,
  }));
}
