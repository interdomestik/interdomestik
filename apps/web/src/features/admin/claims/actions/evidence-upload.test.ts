import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authGetSession: vi.fn(),
  headers: vi.fn(),
  ensureTenantId: vi.fn(),
  resolveTenantFromHost: vi.fn(),
  resolveEvidenceBucketName: vi.fn(),
  findAccessibleAdminUploadClaim: vi.fn(),
  revalidatePath: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  persistClaimDocumentAndQueueWorkflows: vi.fn(),
  validateConfirmedClaimUpload: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: hoisted.authGetSession } },
}));
vi.mock('next/headers', () => ({ headers: hoisted.headers }));
vi.mock('@interdomestik/shared-auth', () => ({ ensureTenantId: hoisted.ensureTenantId }));
vi.mock('@/lib/tenant/tenant-hosts', () => ({
  resolveTenantFromHost: hoisted.resolveTenantFromHost,
}));
vi.mock('@/lib/storage/evidence-bucket', () => ({
  resolveEvidenceBucketName: hoisted.resolveEvidenceBucketName,
}));
vi.mock('next/cache', () => ({ revalidatePath: hoisted.revalidatePath }));
vi.mock('@/features/claims/upload/server/access', () => ({
  findAccessibleAdminUploadClaim: hoisted.findAccessibleAdminUploadClaim,
}));
vi.mock('@/features/claims/upload/server/shared-upload', () => ({
  createSignedUploadUrl: hoisted.createSignedUploadUrl,
  persistClaimDocumentAndQueueWorkflows: hoisted.persistClaimDocumentAndQueueWorkflows,
  revalidatePathForAllLocales: (path: string) => hoisted.revalidatePath(`/mk${path}`),
  validateConfirmedClaimUpload: hoisted.validateConfirmedClaimUpload,
}));

import { confirmAdminUpload, generateAdminUploadUrl } from './evidence-upload';

describe('admin claim evidence upload actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.headers.mockResolvedValue(
      new Headers([
        ['host', 'mk.127.0.0.1.nip.io:3000'],
        ['x-forwarded-host', 'mk.127.0.0.1.nip.io:3000'],
      ])
    );
    hoisted.authGetSession.mockResolvedValue({
      user: { id: 'admin-1', tenantId: 'tenant-1', role: 'admin' },
    });
    hoisted.ensureTenantId.mockReturnValue('tenant-1');
    hoisted.resolveTenantFromHost.mockReturnValue('tenant-1');
    hoisted.resolveEvidenceBucketName.mockReturnValue('claim-evidence');
    hoisted.findAccessibleAdminUploadClaim.mockResolvedValue({
      branchId: 'branch-1',
      staffId: 'staff-1',
    });
    hoisted.createSignedUploadUrl.mockResolvedValue({
      success: true,
      bucket: 'claim-evidence',
      path: 'pii/tenants/tenant-1/claims/claim-1/file.pdf',
      token: 'upload-token',
      intentToken: 'upload-intent-token',
      id: 'file-id',
    });
    hoisted.persistClaimDocumentAndQueueWorkflows.mockResolvedValue(undefined);
    hoisted.validateConfirmedClaimUpload.mockResolvedValue({ success: true });
  });

  it('rejects upload URL issuance when the admin host tenant drifts', async () => {
    hoisted.resolveTenantFromHost.mockReturnValueOnce('tenant-2');

    await expect(
      generateAdminUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024)
    ).resolves.toEqual({ success: false, error: 'Unauthorized', status: 401 });
  });

  it('rejects upload URL issuance for non-admin roles on the admin flow', async () => {
    hoisted.authGetSession.mockResolvedValueOnce({
      user: { id: 'member-1', tenantId: 'tenant-1', role: 'member' },
    });

    await expect(
      generateAdminUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024)
    ).resolves.toEqual({ success: false, error: 'Unauthorized', status: 401 });
  });

  it('denies upload URL issuance for staff outside claim scope', async () => {
    hoisted.authGetSession.mockResolvedValueOnce({
      user: { id: 'staff-2', tenantId: 'tenant-1', role: 'staff', branchId: 'branch-2' },
    });
    hoisted.findAccessibleAdminUploadClaim.mockResolvedValueOnce(null);

    await expect(
      generateAdminUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024)
    ).resolves.toEqual({ success: false, error: 'Claim not found', status: 404 });

    expect(hoisted.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('allows assigned staff even when the claim branch differs', async () => {
    hoisted.authGetSession.mockResolvedValueOnce({
      user: { id: 'staff-2', tenantId: 'tenant-1', role: 'staff', branchId: 'branch-2' },
    });
    hoisted.findAccessibleAdminUploadClaim.mockResolvedValueOnce({
      branchId: 'branch-1',
      staffId: 'staff-2',
    });

    await expect(
      generateAdminUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024)
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
        id: 'file-id',
      })
    );
  });

  it('denies confirm for branch managers outside claim branch scope', async () => {
    hoisted.authGetSession.mockResolvedValueOnce({
      user: {
        id: 'branch-manager-1',
        tenantId: 'tenant-1',
        role: 'branch_manager',
        branchId: 'branch-2',
      },
    });
    hoisted.findAccessibleAdminUploadClaim.mockResolvedValueOnce(null);

    await expect(
      confirmAdminUpload({
        claimId: 'claim-1',
        storagePath: 'pii/tenants/tenant-1/claims/claim-1/file.pdf',
        originalName: 'evidence.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        fileId: 'file-id',
        uploadIntentToken: 'upload-intent-token',
        uploadedBucket: 'claim-evidence',
      })
    ).resolves.toEqual({ success: false, error: 'Claim not found', status: 404 });

    expect(hoisted.persistClaimDocumentAndQueueWorkflows).not.toHaveBeenCalled();
  });

  it('revalidates admin and staff claim surfaces after confirming upload metadata', async () => {
    await expect(
      confirmAdminUpload({
        claimId: 'claim-1',
        storagePath: 'pii/tenants/tenant-1/claims/claim-1/file.pdf',
        originalName: 'evidence.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        fileId: 'file-id',
        uploadIntentToken: 'upload-intent-token',
        uploadedBucket: 'claim-evidence',
      })
    ).resolves.toEqual({ success: true });

    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/mk/admin/claims');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/mk/admin/claims/claim-1');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/mk/staff/claims/claim-1');
  });

  it('rejects forged upload metadata before persistence', async () => {
    hoisted.validateConfirmedClaimUpload.mockResolvedValueOnce({
      success: false,
      error: 'Uploaded file metadata mismatch. Please retry upload.',
      status: 409,
    });

    await expect(
      confirmAdminUpload({
        claimId: 'claim-1',
        storagePath: 'pii/tenants/tenant-1/claims/claim-1/file.pdf',
        originalName: 'evidence.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        fileId: 'file-id',
        uploadIntentToken: 'upload-intent-token',
        uploadedBucket: 'claim-evidence',
      })
    ).resolves.toEqual({
      success: false,
      error: 'Uploaded file metadata mismatch. Please retry upload.',
      status: 409,
    });

    expect(hoisted.persistClaimDocumentAndQueueWorkflows).not.toHaveBeenCalled();
  });
});
