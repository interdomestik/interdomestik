import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
const m = vi.hoisted(() => ({
  authorize: vi.fn(),
  claim: vi.fn(),
  sign: vi.fn(),
  validate: vi.fn(),
  persist: vi.fn(),
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: m.authorize }));
vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve(
      new Headers({ host: 'ida.localhost', 'x-tenant-id': 'foreign', cookie: 'tenantId=foreign' })
    ),
}));
vi.mock('@/lib/storage/evidence-bucket', () => ({
  resolveEvidenceBucketName: () => 'claim-evidence',
}));
vi.mock('@/features/claims/upload/server/access', () => ({
  findAccessibleAdminUploadClaim: m.claim,
}));
vi.mock('@/features/claims/upload/server/shared-upload', () => ({
  createSignedUploadUrl: m.sign,
  validateConfirmedClaimUpload: m.validate,
  persistClaimDocumentAndQueueWorkflows: m.persist,
  revalidatePathForAllLocales: vi.fn(),
}));
import { generateAdminUploadUrl, confirmAdminUpload } from './evidence-upload';
const confirmation = {
  claimId: 'claim',
  storagePath: 'pii/tenants/tenant_mk/claims/claim/file.pdf',
  originalName: 'file.pdf',
  mimeType: 'application/pdf',
  fileSize: 128,
  fileId: 'file',
  uploadIntentToken: 'intent',
  uploadedBucket: 'claim-evidence',
};
describe('canonical admin upload authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.claim.mockResolvedValue({ branchId: 'branch', staffId: 'actor' });
    m.sign.mockResolvedValue({ success: true });
    m.validate.mockResolvedValue({ success: true });
    m.persist.mockResolvedValue(undefined);
  });
  it.each(['tenant_ks', 'tenant_mk', 'pilot-mk'])(
    'uses one paired authority on IDA for %s',
    async tenantId => {
      const authority = mintTestTenantAuthority(tenantId);
      m.authorize.mockResolvedValue({
        session: { user: { id: 'actor', role: 'staff', branchId: 'branch', tenantId } },
        authority,
      });
      expect(
        (await generateAdminUploadUrl('claim', 'file.pdf', 'application/pdf', 128)).success
      ).toBe(true);
      expect(m.authorize).toHaveBeenCalledOnce();
      expect(m.claim).toHaveBeenCalledWith({
        authority,
        claimId: 'claim',
        branchId: 'branch',
        role: 'staff',
        userId: 'actor',
      });
      expect(m.sign).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId, actorId: 'actor', bucket: 'claim-evidence' })
      );
    }
  );
  it.each([null, { session: { user: { id: 'actor', role: 'admin' } }, authority: {} }])(
    'fails closed on absent or invalid authority %j',
    async authorized => {
      m.authorize.mockResolvedValue(authorized);
      expect(
        await generateAdminUploadUrl('claim', 'file.pdf', 'application/pdf', 128)
      ).toMatchObject({ success: false, status: 401 });
      expect(m.claim).not.toHaveBeenCalled();
      expect(m.sign).not.toHaveBeenCalled();
    }
  );
  it('returns 401 when authority resolution throws', async () => {
    m.authorize.mockRejectedValueOnce(new Error('missing tenant'));
    expect(await confirmAdminUpload(confirmation)).toMatchObject({ success: false, status: 401 });
    expect(m.persist).not.toHaveBeenCalled();
  });
  it('preserves bucket mismatch and token/path validation before persistence', async () => {
    const authority = mintTestTenantAuthority('tenant_mk');
    m.authorize.mockResolvedValue({ session: { user: { id: 'actor', role: 'admin' } }, authority });
    expect(await confirmAdminUpload({ ...confirmation, uploadedBucket: 'other' })).toMatchObject({
      success: false,
      status: 409,
    });
    expect(m.validate).not.toHaveBeenCalled();
    m.validate.mockResolvedValueOnce({ success: false, status: 409, error: 'Invalid intent' });
    expect(await confirmAdminUpload(confirmation)).toMatchObject({ success: false, status: 409 });
    expect(m.validate).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'actor', tenantId: 'tenant_mk', confirmation })
    );
    expect(m.persist).not.toHaveBeenCalled();
  });
});
