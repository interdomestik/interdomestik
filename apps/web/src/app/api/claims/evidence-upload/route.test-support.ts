import { fixtureSessionAuthority } from '@/test/member-acceptance.test-support';
import { vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  resolveEvidenceBucketName: vi.fn(),
  findAccessibleAdminUploadClaim: vi.fn(),
  upload: vi.fn(),
  createAdminClient: vi.fn(),
  confirmAdminUpload: vi.fn(),
  confirmUpload: vi.fn(),
  createClaimUploadIntentToken: vi.fn(),
  captureMessage: vi.fn(),
  findOwnedMemberUploadClaim: vi.fn(),
  findOwnedMemberInformationRequest: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
}));
export const evidenceUploadMocks = hoisted;

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: () =>
    hoisted.getSession().then(
      (
        session: {
          user: { tenantId: string; id: string; role?: string; branchId?: string };
        } | null
      ) =>
        session
          ? { session, authority: fixtureSessionAuthority(session.user.tenantId, session.user) }
          : null
    ),
}));
vi.mock('@/lib/storage/evidence-bucket', () => ({
  DEFAULT_EVIDENCE_BUCKET: 'claim-evidence',
  resolveEvidenceBucketName: hoisted.resolveEvidenceBucketName,
}));
vi.mock('@interdomestik/database', () => ({
  createAdminClient: hoisted.createAdminClient,
}));
vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
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
  findOwnedMemberInformationRequest: hoisted.findOwnedMemberInformationRequest,
  findOwnedMemberUploadClaim: hoisted.findOwnedMemberUploadClaim,
}));
vi.mock('@/features/claims/upload/server/shared-upload', () => ({
  createClaimUploadIntentToken: hoisted.createClaimUploadIntentToken,
}));
vi.mock('@sentry/nextjs', () => ({
  captureMessage: hoisted.captureMessage,
}));

export function createEvidenceUploadRequest(
  file = new File(['test'], 'evidence.pdf', { type: 'application/pdf' }),
  informationRequestId?: string
): Request {
  const form = new FormData();
  form.set('claimId', 'claim-1');
  form.set('category', 'evidence');
  form.set('locale', 'mk');
  form.set('file', file);
  if (informationRequestId) form.set('informationRequestId', informationRequestId);

  return {
    headers: new Headers({
      host: 'tenant.example.test',
      'x-forwarded-host': 'tenant.example.test',
    }),
    formData: vi.fn().mockResolvedValue(form),
  } as unknown as Request;
}

export function resetEvidenceUploadMocks() {
  vi.clearAllMocks();
  hoisted.getSession.mockResolvedValue({
    user: { id: 'staff-1', role: 'staff', branchId: 'branch-1', tenantId: 'tenant-1' },
  });
  hoisted.resolveEvidenceBucketName.mockReturnValue('claim-evidence');
  hoisted.findAccessibleAdminUploadClaim.mockResolvedValue({
    branchId: 'branch-1',
    staffId: 'staff-1',
  });
  hoisted.findOwnedMemberUploadClaim.mockResolvedValue({ id: 'claim-1' });
  hoisted.findOwnedMemberInformationRequest.mockResolvedValue({
    id: '12345678-1234-4234-8234-123456789012',
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
}
