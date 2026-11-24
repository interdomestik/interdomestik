import { authorizedSession, STAFF_A } from '@/test/safe-action-harness';
import { expect, it, vi } from 'vitest';
import { updateClaimStatusCore } from './staff-claims/update-status.core';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  audit: vi.fn(),
  rateLimit: vi.fn(),
  changeStatus: vi.fn(),
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.audit }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimitForAction: mocks.rateLimit }));
vi.mock('@/lib/claim-status-action-effects', () => ({ completeClaimStatusEffects: vi.fn() }));
vi.mock('@interdomestik/domain-claims/claims/change-status', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/domain-claims/claims/change-status')>()),
  changeClaimStatus: mocks.changeStatus,
}));

it('rate limits staff status changes before calling the domain command', async () => {
  mocks.authorize.mockResolvedValue(authorizedSession(STAFF_A));
  mocks.audit.mockResolvedValue({ ok: true });
  mocks.rateLimit.mockResolvedValue({ limited: true });

  await expect(
    updateClaimStatusCore({ claimId: 'c1', toStatus: 'submitted', isPublicNote: true })
  ).resolves.toMatchObject({
    success: false,
    code: 'RATE_LIMITED',
  });
  expect(mocks.rateLimit).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'action:staff-update-status:staff-a',
      limit: 20,
      windowSeconds: 60,
    })
  );
  expect(mocks.changeStatus).not.toHaveBeenCalled();
});
