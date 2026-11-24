import { fixtureSessionAuthority, refuseAcceptance } from '@/test/member-acceptance.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  context: {} as Record<string, unknown>,
  rateLimit: vi.fn(),
  submitClaimCore: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/safe-action', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/safe-action')>()),
  runAuthenticatedAction: (handler: (ctx: Record<string, unknown>) => Promise<unknown>) =>
    handler(mocks.context),
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimitForAction: mocks.rateLimit }));
vi.mock('./claims/submit', () => ({ submitClaimCore: mocks.submitClaimCore }));
vi.mock('./claims/create', () => ({ createClaimCore: vi.fn() }));
vi.mock('./claims/draft', () => ({ updateDraftClaimCore: vi.fn() }));

import type { CreateClaimValues } from '@/lib/validators/claims';
import { submitClaim } from './claims.core';

describe('submitClaim authority hand-off', () => {
  const data = { title: 'Valid title here' } as CreateClaimValues;
  const session = { user: { id: 'user-1', role: 'member', tenantId: 'tenant-1' } };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ limited: false });
    mocks.submitClaimCore.mockResolvedValue({ success: true });
    mocks.authorize.mockResolvedValue({
      session,
      authority: fixtureSessionAuthority('tenant-1', session.user),
    });
    mocks.context = {
      authority: fixtureSessionAuthority('tenant-other', session.user),
      requestHeaders: new Headers(),
    };
  });

  it('passes the admitted authority itself to the submit core', async () => {
    const authority = fixtureSessionAuthority('tenant-1', session.user);
    mocks.authorize.mockResolvedValue({ session, authority });

    await submitClaim(data, 'key-1');

    expect(mocks.submitClaimCore).toHaveBeenCalledTimes(1);
    expect(mocks.submitClaimCore.mock.calls[0]?.[0].authority).toBe(authority);
    expect(mocks.submitClaimCore.mock.calls[0]?.[0]).toMatchObject({
      session,
      data,
      idempotencyKey: 'key-1',
    });
  });

  it('refuses a missing session before the core', async () => {
    mocks.authorize.mockResolvedValue(null);
    await expect(submitClaim(data)).resolves.toMatchObject({
      success: false,
      code: 'UNAUTHORIZED',
    });
    expect(mocks.submitClaimCore).not.toHaveBeenCalled();
  });

  it('refuses missing acceptance before the core', async () => {
    refuseAcceptance();
    await expect(submitClaim(data)).resolves.toMatchObject({
      success: false,
      code: 'acceptance_required',
    });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.submitClaimCore).not.toHaveBeenCalled();
  });

  it('does not reach the submit core when rate limited', async () => {
    mocks.rateLimit.mockResolvedValue({ limited: true });

    const result = await submitClaim(data);

    expect(result).toMatchObject({ success: false });
    expect(mocks.submitClaimCore).not.toHaveBeenCalled();
  });
});
