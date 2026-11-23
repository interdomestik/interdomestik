import { memberUser } from './member-acceptance-denial.test-support';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockActivateSubscription } from '@/actions/billing-test';
import {
  getMemberDocumentsCore,
  getMemberLeavableSponsorEntryCore,
  getMemberSubscriptionsCore,
} from '@/app/[locale]/(app)/member/membership/_core';
import {
  getCompanyMembershipOutlook,
  leaveCompanyProgramme,
} from '@/app/[locale]/(app)/member/membership/leave-sponsorship.core';

const protectedCalls = vi.hoisted(() => ({
  resolvePlan: vi.fn(),
  readMembership: vi.fn(),
  readLeavable: vi.fn(),
  leave: vi.fn(),
  readOutlook: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@interdomestik/domain-membership-billing/annual-membership', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@interdomestik/domain-membership-billing/annual-membership')
  >()),
  resolveCanonicalMembershipPlanState: protectedCalls.resolvePlan,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@interdomestik/domain-membership-billing/sponsor-coverage')
  >()),
  readSponsorOutlook: protectedCalls.readOutlook,
  resolveEffectiveMembership: protectedCalls.readMembership,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/opt-out', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@interdomestik/domain-membership-billing/sponsors/opt-out')
  >()),
  leaveSponsorship: protectedCalls.leave,
  listLeavableSponsorEntries: protectedCalls.readLeavable,
}));

afterEach(() => vi.unstubAllEnvs());

describe('member acceptance on membership entries', () => {
  it('refuses sponsor outlook and opt-out before either protected operation', async () => {
    await expect(getCompanyMembershipOutlook()).resolves.toEqual({
      ok: false,
      code: 'acceptance_required',
    });
    await expect(leaveCompanyProgramme({ entryId: 'fixture-entry' })).resolves.toEqual({
      ok: false,
      error: 'acceptance_required',
    });
    expect(protectedCalls.readOutlook).not.toHaveBeenCalled();
    expect(protectedCalls.readLeavable).not.toHaveBeenCalled();
    expect(protectedCalls.leave).not.toHaveBeenCalled();
  });

  it('re-resolves admission inside each loader even when the caller has the prior member identity', async () => {
    const input = { userId: memberUser.id, tenantId: memberUser.tenantId };
    await expect(getMemberSubscriptionsCore(input)).resolves.toEqual([]);
    await expect(getMemberLeavableSponsorEntryCore(input)).resolves.toBeNull();
    await expect(getMemberDocumentsCore(input)).resolves.toEqual([]);
    expect(protectedCalls.readMembership).not.toHaveBeenCalled();
    expect(protectedCalls.readLeavable).not.toHaveBeenCalled();
  });

  it('disables test activation outside its environment even for an admitted member', async () => {
    vi.stubEnv('BILLING_TEST_MODE', '0');
    await expect(mockActivateSubscription('plan', 'price')).rejects.toThrow(
      'Billing test mode not enabled'
    );
    expect(protectedCalls.resolvePlan).not.toHaveBeenCalled();
  });

  it('requires acceptance inside the explicit local billing-test environment', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_BILLING_TEST_MODE', '1');
    vi.stubEnv('BILLING_TEST_MODE', '1');
    vi.stubEnv('INTERDOMESTIK_PRODUCTION', '0');
    vi.stubEnv('VERCEL_ENV', 'development');
    await expect(mockActivateSubscription('plan', 'price')).rejects.toThrow('acceptance_required');
    expect(protectedCalls.resolvePlan).not.toHaveBeenCalled();
  });
});
