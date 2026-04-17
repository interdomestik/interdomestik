import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  ensureTenantId: vi.fn(),
  resolveEvidenceBucketName: vi.fn(),
  resolveTenantFromHost: vi.fn(),
  findAccessibleAdminUploadClaim: vi.fn(),
  upload: vi.fn(),
  createAdminClient: vi.fn(),
  confirmAdminUpload: vi.fn(),
  confirmUpload: vi.fn(),
  captureMessage: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: hoisted.getSession } },
}));
vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantId,
}));
vi.mock('@/lib/storage/evidence-bucket', () => ({
  resolveEvidenceBucketName: hoisted.resolveEvidenceBucketName,
}));
vi.mock('@/lib/tenant/tenant-hosts', () => ({
  resolveTenantFromHost: hoisted.resolveTenantFromHost,
}));
vi.mock('@interdomestik/database', () => ({
  createAdminClient: hoisted.createAdminClient,
}));
vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
}));
vi.mock('@/features/admin/claims/actions', () => ({
  confirmAdminUpload: hoisted.confirmAdminUpload,
}));
vi.mock('@/features/member/claims/actions', () => ({
  confirmUpload: hoisted.confirmUpload,
}));
vi.mock('@/features/claims/upload/server/access', () => ({
  findAccessibleAdminUploadClaim: hoisted.findAccessibleAdminUploadClaim,
}));
vi.mock('@sentry/nextjs', () => ({
  captureMessage: hoisted.captureMessage,
}));

import { POST } from './route';

function createEvidenceUploadRequest(): Request {
  const form = new FormData();
  form.set('claimId', 'claim-1');
  form.set('category', 'evidence');
  form.set('locale', 'mk');
  form.set('file', new File(['test'], 'evidence.pdf', { type: 'application/pdf' }));

  return {
    headers: new Headers({
      host: 'tenant.example.test',
      'x-forwarded-host': 'tenant.example.test',
    }),
    formData: vi.fn().mockResolvedValue(form),
  } as unknown as Request;
}

describe('POST /api/claims/evidence-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSession.mockResolvedValue({
      user: { id: 'staff-1', role: 'staff', branchId: 'branch-1', tenantId: 'tenant-1' },
    });
    hoisted.ensureTenantId.mockReturnValue('tenant-1');
    hoisted.resolveEvidenceBucketName.mockReturnValue('claim-evidence');
    hoisted.resolveTenantFromHost.mockReturnValue('tenant-1');
    hoisted.findAccessibleAdminUploadClaim.mockResolvedValue({
      branchId: 'branch-1',
      staffId: 'staff-1',
    });
    hoisted.upload.mockResolvedValue({ error: null });
    hoisted.createAdminClient.mockReturnValue({
      storage: {
        from: () => ({
          upload: hoisted.upload,
        }),
      },
    });
    hoisted.confirmAdminUpload.mockResolvedValue({ success: true });
    hoisted.confirmUpload.mockResolvedValue({ success: true });
  });

  it('denies staff uploads outside branch or assignment scope before storage upload', async () => {
    hoisted.findAccessibleAdminUploadClaim.mockResolvedValueOnce(null);

    const response = await POST(createEvidenceUploadRequest());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'Claim not found' });
    expect(hoisted.upload).not.toHaveBeenCalled();
    expect(hoisted.confirmAdminUpload).not.toHaveBeenCalled();
  });

  it('captures orphan-upload telemetry when metadata confirmation fails after storage upload', async () => {
    hoisted.confirmAdminUpload.mockResolvedValueOnce({
      success: false,
      error: 'Failed to save document metadata',
      status: 500,
    });

    const response = await POST(createEvidenceUploadRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to save document metadata' });
    expect(hoisted.captureMessage).toHaveBeenCalledWith(
      'claim.evidence_upload.confirm_failed_after_storage_upload',
      expect.objectContaining({
        level: 'warning',
      })
    );
  });
});
