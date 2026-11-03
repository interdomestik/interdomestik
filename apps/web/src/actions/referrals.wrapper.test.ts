import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';

import { getAgentReferralLink } from './referrals';

vi.mock('./referrals/context', () => ({
  getActionContext: vi.fn(),
}));

vi.mock('./referrals/get-agent-link', () => ({
  getAgentReferralLinkCore: vi.fn(),
}));

describe('actions/referrals wrapper', () => {
  it('delegates to core with session from context', async () => {
    const { getActionContext } = await import('./referrals/context');
    const { getAgentReferralLinkCore } = await import('./referrals/get-agent-link');

    const authority = mintTestTenantAuthority('tenant_1');
    (getActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { user: { id: 'u1', role: 'agent', name: 'Agent A' } },
      authority,
    });

    (getAgentReferralLinkCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { code: 'AGENT-ABC123', link: 'http://localhost:3000?ref=AGENT-ABC123' },
      error: undefined,
    });

    const result = await getAgentReferralLink();

    expect(getAgentReferralLinkCore).toHaveBeenCalledTimes(1);
    expect(getAgentReferralLinkCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1', role: 'agent', name: 'Agent A' } },
      authority,
    });
    expect(result.success).toBe(true);
  });
});
