import { stubDeploymentOrigin } from '@/lib/deployment-origin.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  return {
    withTenantContext: vi.fn(),
    userFindFirst: vi.fn(async () => ({ referralCode: null, name: 'Jane Doe' })),
    update,
    updateSet,
    updateWhere,
  };
});

vi.mock('@interdomestik/database', () => {
  const db = {
    query: {
      user: {
        findFirst: mocks.userFindFirst,
      },
    },
    update: mocks.update,
  };
  return {
    db,
    withTenantContext: async (context: unknown, cb: (tx: unknown) => unknown) => {
      mocks.withTenantContext(context);
      return cb(db);
    },
  };
});

vi.mock('@interdomestik/database/schema', () => ({
  user: { id: 'user.id' },
}));

import { getMemberReferralLinkCore } from './link';

describe('getMemberReferralLinkCore', () => {
  const authority = mintTestTenantAuthority('tenant_mk');

  beforeEach(() => {
    vi.clearAllMocks();
    stubDeploymentOrigin();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('generates and persists a referral code when missing', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.123456);

    const result = await getMemberReferralLinkCore({
      session: {
        user: { id: 'user-1', role: 'user', name: 'Jane Doe', tenantId: 'tenant_mk' },
      } as unknown as NonNullable<import('./context').Session>,
      authority,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toMatch(/^JANE-[A-Z0-9]{6}$/);
      expect(result.data.link).toBe(`https://staging.interdomestik.com?ref=${result.data.code}`);
      expect(result.data.whatsappShareUrl).toContain(encodeURIComponent(result.data.link));
    }

    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        referralCode: expect.stringMatching(/^JANE-[A-Z0-9]{6}$/),
      })
    );
    expect(mocks.updateWhere).toHaveBeenCalledTimes(1);
  });
});
