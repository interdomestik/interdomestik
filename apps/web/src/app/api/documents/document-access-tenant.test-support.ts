// Shared synthetic document and claim rows for the tenant-bound document-read harness.
export function legacyDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    tenantId: 'tenant-a',
    accessTenantId: 'tenant-a',
    claimId: 'claim-1',
    category: 'evidence',
    bucket: 'claim-evidence',
    filePath: 'pii/tenants/tenant-a/claims/claim-1/doc-1.pdf',
    uploadedBy: 'member-1',
    name: 'evidence.pdf',
    fileType: 'application/pdf',
    fileSize: 1024,
    ...overrides,
  };
}

export const claimRow = {
  claimOwnerId: 'member-1',
  claimBranchId: 'branch-a',
  claimCaseLifecycleState: 'submitted',
  claimStaffId: 'staff-1',
  claimAgentId: null,
};
