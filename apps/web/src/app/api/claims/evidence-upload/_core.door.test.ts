import { fixtureSessionAuthority, refuseAcceptance } from '@/test/member-acceptance.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  authorize: vi.fn(),
  admin: vi.fn(),
  member: vi.fn(),
  parse: vi.fn(),
  upload: vi.fn(),
  intent: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('@interdomestik/domain-claims/claims/inbound-upload', () => ({
  isInboundPilotCase: () => Promise.resolve(false),
  readClaimUploadPaused: () => Promise.resolve(false),
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: m.authorize }));
vi.mock('@/lib/storage/evidence-bucket', () => ({
  resolveEvidenceBucketName: () => 'claim-evidence',
}));
vi.mock('@/features/claims/upload/server/access', () => ({
  findAccessibleAdminUploadClaim: m.admin,
  findOwnedMemberUploadClaim: m.member,
  findOwnedMemberInformationRequest: vi.fn(),
}));
vi.mock('./parse-evidence-upload-form', () => ({ parseEvidenceUploadForm: m.parse }));
vi.mock('./_upload', () => ({
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
  createUploadIntent: m.intent,
  uploadEvidenceObject: m.upload,
}));
vi.mock('./confirm', () => ({ confirmEvidenceUpload: m.confirm }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
import { POST } from './route';
const request = () =>
  new Request('https://ida.localhost/api/claims/evidence-upload', {
    method: 'POST',
    headers: { host: 'ida.localhost', 'x-tenant-id': 'tenant_ks', cookie: 'tenantId=tenant_ks' },
  });
describe('canonical direct upload authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.parse.mockResolvedValue({
      success: true,
      data: {
        category: 'evidence',
        claimId: 'claim',
        file: new File(['mail'], 'file.eml', { type: 'message/rfc822' }),
        locale: 'en',
      },
    });
    m.admin.mockResolvedValue({ id: 'claim' });
    m.member.mockResolvedValue({ id: 'claim' });
    m.intent.mockReturnValue({ success: true, data: 'intent' });
    m.upload.mockResolvedValue(null);
    m.confirm.mockResolvedValue({ success: true });
  });
  it.each(['tenant_ks', 'tenant_mk', 'pilot-mk'])(
    'uses the admin path on IDA for %s',
    async tenantId => {
      const user = { id: 'actor', role: 'admin', branchId: 'branch' };
      const authority = fixtureSessionAuthority(tenantId, user);
      m.authorize.mockResolvedValue({
        session: { user },
        authority,
      });
      expect((await POST(request())).status).toBe(200);
      expect(m.authorize).toHaveBeenCalledOnce();
      expect(m.admin).toHaveBeenCalledWith({
        authority,
        role: 'admin',
        branchId: 'branch',
        claimId: 'claim',
        userId: 'actor',
      });
      expect(m.member).not.toHaveBeenCalled();
      expect(m.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          storagePath: expect.stringContaining(`/tenants/${tenantId}/claims/claim/`),
        })
      );
      expect(m.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ isAdminSurface: true, uploadIntentToken: 'intent' })
      );
    }
  );
  it('refuses before protected work when acceptance is missing', async () => {
    refuseAcceptance();
    const user = { id: 'member', role: 'member' };
    m.authorize.mockResolvedValue({
      session: { user },
      authority: fixtureSessionAuthority('tenant_mk', user),
    });
    const response = await POST(request());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'acceptance_required' });
    expect(m.parse).not.toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request before form parsing or storage', async () => {
    m.authorize.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(m.parse).not.toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
  });
  it('rejects an invalid authority token before effects', async () => {
    m.authorize.mockResolvedValue({ session: { user: { id: 'actor' } }, authority: {} });
    const response = await POST(request());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(m.parse).not.toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
  });
  it('returns a JSON service failure before effects if the session lookup fails', async () => {
    m.authorize.mockRejectedValueOnce(new Error('session service unavailable'));
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Service unavailable' });
    expect(m.parse).not.toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
  });
  it('preserves member ownership denial before upload', async () => {
    m.authorize.mockResolvedValue({
      session: { user: { id: 'member', role: 'member' } },
      authority: fixtureSessionAuthority('tenant_mk', { id: 'member', role: 'member' }),
    });
    m.member.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(404);
    expect(m.admin).not.toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
  });
});
