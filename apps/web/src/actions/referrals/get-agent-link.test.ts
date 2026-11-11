import { stubDeploymentOrigin } from '@/lib/deployment-origin.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from './context';
import { getAgentReferralLinkCore } from './get-agent-link';

const mocks = vi.hoisted(() => ({ withTenantContext: vi.fn() }));

// Mock database
vi.mock('@interdomestik/database', () => {
  const db = {
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
  };
  return {
    db,
    withTenantContext: async (context: unknown, cb: (tx: unknown) => unknown) => {
      mocks.withTenantContext(context);
      return cb(db);
    },
    withTenant: vi.fn(),
  };
});

vi.mock('@interdomestik/database/schema', () => ({
  user: { id: 'user.id', tenantId: 'user.tenant_id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

describe('actions/referrals getAgentReferralLinkCore', () => {
  const authority = mintTestTenantAuthority('tenant_mk');
  beforeEach(() => {
    vi.clearAllMocks();
    stubDeploymentOrigin();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('denies access for non-agent roles', async () => {
    const result = await getAgentReferralLinkCore({
      session: {
        user: { id: 'u1', role: 'user', name: 'Member', tenantId: 'tenant_mk' },
      } as unknown as NonNullable<Session>,
      authority,
    });

    expect(result).toEqual({ success: false, error: 'Access denied' });
  });

  it('denies access when tenantId is missing', async () => {
    const result = await getAgentReferralLinkCore({
      session: {
        user: { id: 'u1', role: 'agent', name: 'Agent', tenantId: null },
      } as unknown as NonNullable<Session>,
      authority: null,
    });

    expect(result).toEqual({ success: false, error: 'Missing tenant context' });
  });

  it('denies access when session is null', async () => {
    const result = await getAgentReferralLinkCore({
      session: null,
      authority: null,
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns referral link for valid agent with tenantId', async () => {
    const result = await getAgentReferralLinkCore({
      session: {
        user: { id: 'agent-1', role: 'agent', name: 'Agent Smith', tenantId: 'tenant_mk' },
      } as unknown as NonNullable<Session>,
      authority,
    });

    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('EXISTING-CODE');
      expect(result.data.link).toContain('ref=EXISTING-CODE');
    }
  });

  it('does not fall back to localhost for production referral links', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    stubDeploymentOrigin('production', 'https://ida.interdomestik.com');

    const result = await getAgentReferralLinkCore({
      session: {
        user: { id: 'agent-1', role: 'agent', name: 'Agent Smith', tenantId: 'tenant_mk' },
      } as unknown as NonNullable<Session>,
      authority,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.link).toBe('https://ida.interdomestik.com?ref=EXISTING-CODE');
    }
  });
});
