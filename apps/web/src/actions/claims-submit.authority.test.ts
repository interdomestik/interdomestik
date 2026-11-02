import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  rateLimit: vi.fn(),
  submitClaimCore: vi.fn(),
}));

vi.mock('@/lib/safe-action', () => ({
  runAuthenticatedAction: (handler: (ctx: Record<string, unknown>) => Promise<unknown>) =>
    handler(mocks.context),
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimitForAction: mocks.rateLimit }));
vi.mock('./claims/submit', () => ({ submitClaimCore: mocks.submitClaimCore }));
vi.mock('./claims/create', () => ({ createClaimCore: vi.fn() }));
vi.mock('./claims/draft', () => ({ cancelClaimCore: vi.fn(), updateDraftClaimCore: vi.fn() }));
vi.mock('./claims/status', () => ({ updateClaimStatusCore: vi.fn() }));

import type { CreateClaimValues } from '@/lib/validators/claims';
import { submitClaim } from './claims.core';

describe('submitClaim authority hand-off', () => {
  const data = { title: 'Valid title here' } as CreateClaimValues;
  const session = { user: { id: 'user-1', role: 'member', tenantId: 'tenant-1' } };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ limited: false });
    mocks.submitClaimCore.mockResolvedValue({ success: true });
  });

  it('passes the action context authority itself to the submit core', async () => {
    const authority = mintTestTenantAuthority('tenant-1');
    mocks.context = { session, authority, requestHeaders: new Headers() };

    await submitClaim(data, 'key-1');

    expect(mocks.submitClaimCore).toHaveBeenCalledTimes(1);
    expect(mocks.submitClaimCore.mock.calls[0]?.[0].authority).toBe(authority);
    expect(mocks.submitClaimCore.mock.calls[0]?.[0]).toMatchObject({
      session,
      data,
      idempotencyKey: 'key-1',
    });
  });

  it('passes a null authority through so the core refuses to submit', async () => {
    mocks.context = { session, authority: null, requestHeaders: new Headers() };

    await submitClaim(data);

    expect(mocks.submitClaimCore.mock.calls[0]?.[0].authority).toBeNull();
  });

  it('does not reach the submit core when rate limited', async () => {
    mocks.rateLimit.mockResolvedValue({ limited: true });
    mocks.context = {
      session,
      authority: mintTestTenantAuthority('tenant-1'),
      requestHeaders: new Headers(),
    };

    const result = await submitClaim(data);

    expect(result).toMatchObject({ success: false });
    expect(mocks.submitClaimCore).not.toHaveBeenCalled();
  });
});
