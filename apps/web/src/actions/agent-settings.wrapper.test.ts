import { describe, expect, it, vi } from 'vitest';

import { getAgentSettings, updateAgentCommissionRates, updateAgentTier } from './agent-settings';

vi.mock('./agent-settings/context', () => ({
  getActionContext: vi.fn(async () => ({ session: { user: { id: 'u1', role: 'admin' } } })),
}));

vi.mock('./agent-settings/get', () => ({
  getAgentSettingsCore: vi.fn(async () => ({ success: true, data: null })),
}));

vi.mock('./agent-settings/update-rates', () => ({
  updateAgentCommissionRatesCore: vi.fn(async () => ({ success: true })),
}));

vi.mock('./agent-settings/update-tier', () => ({
  updateAgentTierCore: vi.fn(async () => ({ success: true })),
}));

describe('agent-settings action wrapper', () => {
  it('delegates getAgentSettings to core', async () => {
    const { getActionContext } = await import('./agent-settings/context');
    const { getAgentSettingsCore } = await import('./agent-settings/get');

    const result = await getAgentSettings('agent-1');

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(getAgentSettingsCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1', role: 'admin' } },
      agentId: 'agent-1',
    });
    expect(result).toEqual({ success: true, data: null });
  });

  it('delegates updateAgentCommissionRates to core', async () => {
    const { getActionContext } = await import('./agent-settings/context');
    const { updateAgentCommissionRatesCore } = await import('./agent-settings/update-rates');

    const result = await updateAgentCommissionRates('agent-1', {
      member: 0.1,
    } as unknown as import('./commissions.types').CommissionRates);

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(updateAgentCommissionRatesCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1', role: 'admin' } },
      agentId: 'agent-1',
      rates: { member: 0.1 },
    });
    expect(result).toEqual({ success: true });
  });

  it('delegates updateAgentTier to core', async () => {
    const { getActionContext } = await import('./agent-settings/context');
    const { updateAgentTierCore } = await import('./agent-settings/update-tier');

    const result = await updateAgentTier('agent-1', 'premium');

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(updateAgentTierCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1', role: 'admin' } },
      agentId: 'agent-1',
      tier: 'premium',
    });
    expect(result).toEqual({ success: true });
  });
});
