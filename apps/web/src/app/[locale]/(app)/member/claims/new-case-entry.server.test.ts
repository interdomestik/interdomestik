import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  authorize: vi.fn(),
  hasActive: vi.fn(),
  neutral: vi.fn(),
}));

vi.mock('@/app/api/auth/[...all]/neutral-otp-boundary', () => ({
  evaluateNeutralOtpHost: h.neutral,
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionUserTenant: h.authorize }));
vi.mock('@/lib/tenant/tenant-hosts', () => ({ resolveDefaultPublicTenantId: () => 'tenant_ks' }));
vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  hasActiveMembership: h.hasActive,
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));

import { resolveMemberNewCaseEntry } from './new-case-entry.server';

type User = { id: string; role: string; tenantId?: string; accessTenantId?: string };
const MEMBER: User = { id: 'member-1', role: 'member', tenantId: 'tenant_ks' };
const entryFor = (user: User) => resolveMemberNewCaseEntry({ user });

describe('resolveMemberNewCaseEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.authorize.mockResolvedValue({ tenant: 'authority' });
    h.hasActive.mockResolvedValue(false);
    h.neutral.mockReturnValue(true);
  });

  it('opens the case intake for a member with access', async () => {
    h.hasActive.mockResolvedValue(true);
    await expect(entryFor(MEMBER)).resolves.toEqual({
      href: '/member/claims/new',
      kind: 'case',
    });
  });

  it.each(['member', 'user'])('opens the draft-only intake for an eligible %s', async role => {
    await expect(entryFor({ ...MEMBER, role })).resolves.toEqual({
      href: '/member/claims/new?mode=drafts',
      kind: 'draft',
    });
  });

  it.each([
    ['a tenant host', { neutral: false, user: MEMBER }],
    ['another tenant', { neutral: true, user: { ...MEMBER, tenantId: 'tenant_mk' } }],
    ['an agent session', { neutral: true, user: { ...MEMBER, role: 'agent' } }],
  ])('sends the member to the membership on %s', async (_label, { neutral, user }) => {
    h.neutral.mockReturnValue(neutral);
    await expect(entryFor(user)).resolves.toEqual({
      href: '/member/membership',
      kind: 'membership',
    });
  });

  it('uses the access tenant like the intake does', async () => {
    const draft = { href: '/member/claims/new?mode=drafts', kind: 'draft' };
    await expect(
      entryFor({ ...MEMBER, tenantId: 'tenant_mk', accessTenantId: ' tenant_ks ' })
    ).resolves.toEqual(draft);
    await expect(entryFor({ ...MEMBER, accessTenantId: 'tenant_mk' })).resolves.toMatchObject({
      kind: 'membership',
    });
  });

  it('never reads membership without the session authority', async () => {
    h.authorize.mockResolvedValue(null);
    h.neutral.mockReturnValue(false);
    await expect(entryFor(MEMBER)).resolves.toMatchObject({ kind: 'membership' });
    expect(h.hasActive).not.toHaveBeenCalled();
  });

  it('falls back to the gated intake when the access check fails', async () => {
    h.authorize.mockRejectedValue(new Error('db down'));
    await expect(entryFor(MEMBER)).resolves.toEqual({
      href: '/member/claims/new',
      kind: 'case',
    });
  });
});
