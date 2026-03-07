import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgentTierCore } from './_layout.core';

describe('getAgentTierCore', () => {
  const findFirst = vi.fn();
  const services = {
    db: {
      query: {
        agentSettings: {
          findFirst,
        },
      },
    },
  };

  beforeEach(() => {
    findFirst.mockReset();
  });

  it('returns the configured tier when present', async () => {
    findFirst.mockResolvedValue({ tier: 'pro' });

    await expect(getAgentTierCore({ agentId: 'agent-1' }, services as any)).resolves.toBe('pro');
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it('falls back to standard when no settings exist', async () => {
    findFirst.mockResolvedValue(undefined);

    await expect(getAgentTierCore({ agentId: 'agent-1' }, services as any)).resolves.toBe(
      'standard'
    );
  });
});
