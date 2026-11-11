import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubDeploymentOrigin, STAGING_DOOR } from './deployment-origin.test-support';
import { getDefaultAppUrl } from '@/actions/thank-you-letter/config.core';
import { getMemberReferralLinkCore } from '@/actions/member-referrals/link.core';
import { getAgentReferralLinkCore } from '@/actions/referrals/get-agent-link.core';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';

const h = vi.hoisted(() => ({ member: vi.fn(), agent: vi.fn() }));
vi.mock('@interdomestik/domain-referrals/member-referrals/link', () => ({
  getMemberReferralLinkCore: h.member,
}));
vi.mock('@interdomestik/domain-referrals/referrals/get-agent-link', () => ({
  getAgentReferralLinkCore: h.agent,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('server destination adapters', () => {
  it('injects the validated door into both referral cores for every tenant', async () => {
    stubDeploymentOrigin();
    for (const tenantId of ['tenant_ks', 'tenant_mk', 'tenant_al', 'pilot-mk']) {
      const params = {
        authority: mintTestTenantAuthority(tenantId),
        session: { user: { id: 'u1', role: 'agent', tenantId } },
      };
      await getMemberReferralLinkCore(params);
      await getAgentReferralLinkCore(params);
      expect(h.member).toHaveBeenLastCalledWith({ ...params, appOrigin: STAGING_DOOR });
      expect(h.agent).toHaveBeenLastCalledWith({ ...params, appOrigin: STAGING_DOOR });
    }
    expect(getDefaultAppUrl()).toBe(STAGING_DOOR);
  });

  it('rejects missing or stale configuration before referral effects', async () => {
    stubDeploymentOrigin();
    vi.stubEnv('INTERDOMESTIK_BUILT_DEPLOY_ORIGIN', 'https://ida.interdomestik.com');
    const params = { session: null, authority: null };
    await expect(getMemberReferralLinkCore(params)).rejects.toThrow();
    await expect(getAgentReferralLinkCore(params)).rejects.toThrow();
    expect(() => getDefaultAppUrl()).toThrow();
    expect(h.member).not.toHaveBeenCalled();
    expect(h.agent).not.toHaveBeenCalled();
  });
});
