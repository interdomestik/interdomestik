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
  createClaimUploadIntentToken: vi.fn(),
  sanitizeClaimUploadExtension: vi.fn(),
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
vi.mock('@/features/claims/upload/server/shared-upload', () => ({
  createClaimUploadIntentToken: hoisted.createClaimUploadIntentToken,
  sanitizeClaimUploadExtension: hoisted.sanitizeClaimUploadExtension,
}));
vi.mock('@sentry/nextjs', () => ({
  captureMessage: hoisted.captureMessage,
}));

import { POST } from './route';

function createEvidenceUploadRequest(
  file = new File(['test'], 'evidence.pdf', { type: 'application/pdf' })
): Request {
  const form = new FormData();
  form.set('claimId', 'claim-1');
  form.set('category', 'evidence');
  form.set('locale', 'mk');
  form.set('file', file);

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
    hoisted.createClaimUploadIntentToken.mockReturnValue('upload-intent-token');
    hoisted.sanitizeClaimUploadExtension.mockReturnValue('pdf');
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

  it('passes a server-issued upload intent token into metadata confirmation', async () => {
    const response = await POST(createEvidenceUploadRequest());

    expect(response.status).toBe(200);
    expect(hoisted.createClaimUploadIntentToken).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'staff-1',
        bucket: 'claim-evidence',
        claimId: 'claim-1',
        fileSize: 4,
        mimeType: 'application/pdf',
        storageContentType: 'application/pdf',
        tenantId: 'tenant-1',
      })
    );
    expect(hoisted.confirmAdminUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        storageContentType: 'application/pdf',
        uploadIntentToken: 'upload-intent-token',
      })
    );
  });

  it('rejects zero-byte files before storage upload', async () => {
    const response = await POST(
      createEvidenceUploadRequest(new File([], 'empty.pdf', { type: 'application/pdf' }))
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid form payload' });
    expect(hoisted.createClaimUploadIntentToken).not.toHaveBeenCalled();
    expect(hoisted.upload).not.toHaveBeenCalled();
  });

  it('sanitizes direct-upload extensions before storage upload', async () => {
    hoisted.sanitizeClaimUploadExtension.mockReturnValueOnce('bin');

    const response = await POST(
      createEvidenceUploadRequest(
        new File(['test'], 'evidence.pdf/..', { type: 'application/pdf' })
      )
    );

    expect(response.status).toBe(200);
    expect(hoisted.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^pii\/tenants\/tenant-1\/claims\/claim-1\/[^/]+\.bin$/),
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'application/pdf' })
    );
  });

  it('fails upload intent configuration before storage upload', async () => {
    hoisted.createClaimUploadIntentToken.mockImplementationOnce(() => {
      throw new Error('missing secret');
    });

    const response = await POST(createEvidenceUploadRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Upload configuration error' });
    expect(hoisted.upload).not.toHaveBeenCalled();
    expect(hoisted.confirmAdminUpload).not.toHaveBeenCalled();
  });
});
