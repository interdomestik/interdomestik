import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authorizedSession, MEMBER_A } from '@/test/safe-action-harness';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  domainUpdate: vi.fn(),
  rateLimit: vi.fn(),
  write: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimitForAction: mocks.rateLimit }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), setUser: vi.fn(), setTag: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@interdomestik/domain-claims/claims/draft', () => ({
  cancelClaimCore: vi.fn(),
  updateDraftClaimCore: mocks.domainUpdate,
}));

import { updateDraftClaim } from './claims.core';

const data = { title: 'Draft title', files: [] } as never;

describe('updateDraftClaim action boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue(authorizedSession(MEMBER_A));
    mocks.rateLimit.mockResolvedValue({ limited: false });
    mocks.write.mockResolvedValue({ ok: true });
  });

  it.each([
    {
      success: false,
      error: 'Invalid file path detected. Evidence must be uploaded by the claimant.',
      code: 'INVALID_PATH',
    },
    { success: false, error: 'Claim changed. Refresh and retry.', code: 'CONFLICT' },
  ])('returns the core refusal $code to the caller unchanged', async refusal => {
    mocks.domainUpdate.mockResolvedValue(refusal);

    await expect(updateDraftClaim('claim-1', data)).resolves.toEqual(refusal);
  });

  it('hands the session authority and the intent validator to the domain command', async () => {
    mocks.domainUpdate.mockResolvedValue({ success: true });
    const authorized = authorizedSession(MEMBER_A);
    mocks.authorize.mockResolvedValue(authorized);

    await expect(updateDraftClaim('claim-1', data)).resolves.toEqual({ success: true });
    const [params, deps] = mocks.domainUpdate.mock.calls[0] ?? [];
    expect(params).toMatchObject({ claimId: 'claim-1', authority: authorized.authority });
    expect(deps.validateSubmittedClaimFile).toEqual(expect.any(Function));
  });
});
