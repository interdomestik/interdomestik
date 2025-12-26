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

    (getActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { user: { id: 'u1', role: 'agent', name: 'Agent A' } },
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
    });
    expect(result.success).toBe(true);
  });
});
