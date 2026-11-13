import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMemberReferralLinkCore } from './member-referrals/link';
import { getAgentReferralLinkCore } from './referrals/get-agent-link';

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));
vi.mock('@interdomestik/database', () => ({
  withTenantContext: (_authority: unknown, run: (tx: unknown) => unknown) =>
    Promise.resolve(
      run({
        query: { user: { findFirst: mocks.findFirst } },
        update: mocks.update,
      })
    ),
}));
vi.mock('@interdomestik/database/schema', () => ({ user: { id: 'id', tenantId: 'tenantId' } }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue({ referralCode: 'CODE_A-42' });
});

describe('referral destination injection', () => {
  it.each([
    'https://ida.interdomestik.com',
    'https://staging.interdomestik.com',
    'http://ida.localhost:3310',
    'https://ida.127.0.0.1.nip.io:3443',
  ])('keeps member and agent links on %s for every tenant', async appOrigin => {
    for (const tenantId of ['tenant_ks', 'tenant_mk', 'tenant_al', 'pilot-mk']) {
      const params = {
        appOrigin,
        authority: mintTestTenantAuthority(tenantId),
        session: { user: { id: 'u1', role: 'agent', name: 'Agent', tenantId } },
      };
      const member = await getMemberReferralLinkCore(params);
      const agent = await getAgentReferralLinkCore(params);
      expect(member.success).toBe(true);
      expect(agent.success).toBe(true);
      if (!member.success || !agent.success) throw new Error('Expected referral success');
      const expected = `${appOrigin}?ref=CODE_A-42`;
      expect(member.data.code).toBe('CODE_A-42');
      expect(member.data.link).toBe(expected);
      expect(agent.data.link).toBe(expected);
      const wrapper = new URL(member.data.whatsappShareUrl);
      expect(wrapper.origin).toBe('https://wa.me');
      expect(wrapper.searchParams.get('text')).toBe(
        `Join Asistenca with my referral link and get protection for your family! ${expected}`
      );
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
