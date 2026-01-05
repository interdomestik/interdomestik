import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from './context';
import { getAgentReferralLinkCore } from './get-agent-link';

// Mock database
vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      user: {
        findFirst: vi.fn().mockResolvedValue({ referralCode: 'EXISTING-CODE' }),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
  withTenant: vi.fn(),
}));

vi.mock('@interdomestik/database/schema', () => ({
  user: { id: 'user.id', tenantId: 'user.tenant_id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

describe('actions/referrals getAgentReferralLinkCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies access for non-agent roles', async () => {
    const result = await getAgentReferralLinkCore({
      session: {
        user: { id: 'u1', role: 'user', name: 'Member', tenantId: 'tenant_mk' },
      } as unknown as NonNullable<Session>,
    });

    expect(result).toEqual({ success: false, error: 'Access denied' });
  });

  it('denies access when tenantId is missing', async () => {
    const result = await getAgentReferralLinkCore({
      session: {
        user: { id: 'u1', role: 'agent', name: 'Agent', tenantId: null },
      } as unknown as NonNullable<Session>,
    });

    expect(result).toEqual({ success: false, error: 'Missing tenant context' });
  });

  it('denies access when session is null', async () => {
    const result = await getAgentReferralLinkCore({
      session: null,
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns referral link for valid agent with tenantId', async () => {
    const result = await getAgentReferralLinkCore({
      session: {
        user: { id: 'agent-1', role: 'agent', name: 'Agent Smith', tenantId: 'tenant_mk' },
      } as unknown as NonNullable<Session>,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('EXISTING-CODE');
      expect(result.data.link).toContain('ref=EXISTING-CODE');
    }
  });
});
