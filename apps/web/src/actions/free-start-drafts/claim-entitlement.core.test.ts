import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hasAdmittedClaimEntitlement } from './claim-entitlement.core';

const mocks = vi.hoisted(() => ({
  admission: vi.fn(),
  hasActiveMembership: vi.fn(),
}));
vi.mock('@/lib/privacy/require-member-acceptance', () => ({
  requireAdmittedMember: mocks.admission,
}));
vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  hasActiveMembership: mocks.hasActiveMembership,
}));

const context = {
  accessTenantId: 'tenant_ks',
  actorRole: 'member',
  ownerUserId: 'owner-a',
  tenantId: 'tenant_ks',
} as const;

function admitted(userId = 'owner-a', tenantId = 'tenant_ks') {
  const authority = mintTestTenantAuthority(tenantId, { userId, role: 'member' });
  mocks.admission.mockResolvedValue({
    ok: true,
    authorized: { session: { user: { id: userId, role: 'member', tenantId } }, authority },
  });
  return authority;
}

describe('hasAdmittedClaimEntitlement', () => {
  beforeEach(() => {
    mocks.admission.mockReset();
    mocks.hasActiveMembership.mockReset();
    mocks.hasActiveMembership.mockResolvedValue(true);
  });

  it('refuses without reading membership when this request is not admitted', async () => {
    mocks.admission.mockResolvedValue({ ok: false, failure: { code: 'acceptance_required' } });

    await expect(hasAdmittedClaimEntitlement(context)).resolves.toBe(false);
    expect(mocks.hasActiveMembership).not.toHaveBeenCalled();
  });

  it('refuses another owner or tenant than the draft context', async () => {
    admitted('owner-b');
    await expect(hasAdmittedClaimEntitlement(context)).resolves.toBe(false);

    admitted('owner-a', 'tenant_mk');
    await expect(hasAdmittedClaimEntitlement(context)).resolves.toBe(false);

    admitted();
    await expect(
      hasAdmittedClaimEntitlement({ ...context, accessTenantId: 'tenant_mk' })
    ).resolves.toBe(false);

    expect(mocks.hasActiveMembership).not.toHaveBeenCalled();
  });

  it('reads membership with the admitted authority of this request', async () => {
    const authority = admitted();

    await expect(hasAdmittedClaimEntitlement(context)).resolves.toBe(true);
    expect(mocks.admission).toHaveBeenCalledOnce();
    expect(mocks.hasActiveMembership).toHaveBeenCalledOnce();
    expect(mocks.hasActiveMembership.mock.calls[0]?.[0]).toBe('owner-a');
    // Authority tokens compare structurally equal; only identity proves the admitted one.
    expect(mocks.hasActiveMembership.mock.calls[0]?.[1]).toBe(authority);
  });

  it('returns a missing membership as not entitled', async () => {
    admitted();
    mocks.hasActiveMembership.mockResolvedValue(false);

    await expect(hasAdmittedClaimEntitlement(context)).resolves.toBe(false);
  });
});
