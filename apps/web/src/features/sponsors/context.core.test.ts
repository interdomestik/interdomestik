import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES } from '@interdomestik/shared-auth';
import { context } from './test-fixtures';
import { sponsorContext, mayUseArea } from './context.core';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), tier: vi.fn() }));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/app/[locale]/(agent)/agent/_layout.core', () => ({ getAgentTier: mocks.tier }));
beforeEach(() => vi.clearAllMocks());

describe('authenticated sponsor context', () => {
  it('returns no context without a session', async () => {
    mocks.authorize.mockResolvedValue(null);
    expect(await sponsorContext()).toBeNull();
  });
  it.each([ROLES.auditor, ROLES.global_support, ROLES.member])('refuses %s', async role => {
    mocks.authorize.mockResolvedValue({
      authority: context.authority,
      session: { user: { id: 'u', role, branchId: 'b' } },
    });
    expect(await sponsorContext()).toBeNull();
  });
  it('loads office tier under the authenticated tenant and refuses field agents', async () => {
    mocks.authorize.mockResolvedValue({
      authority: context.authority,
      session: { user: { id: 'u', role: ROLES.agent, branchId: 'b' } },
    });
    mocks.tier.mockResolvedValue('office');
    expect((await sponsorContext())?.actor.agentTier).toBe('office');
    expect(mocks.tier).toHaveBeenCalledWith({ agentId: 'u', authority: context.authority });
    mocks.tier.mockResolvedValue('field');
    expect(await sponsorContext()).toBeNull();
  });
  it('keeps canonical role areas distinct', () => {
    expect(mayUseArea(context.actor, 'staff')).toBe(true);
    expect(mayUseArea(context.actor, 'admin')).toBe(false);
    expect(mayUseArea({ ...context.actor, role: ROLES.branch_manager }, 'admin')).toBe(true);
    expect(
      mayUseArea({ ...context.actor, role: ROLES.branch_manager, branchId: null }, 'admin')
    ).toBe(false);
  });
});
