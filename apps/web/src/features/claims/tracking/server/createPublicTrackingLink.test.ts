import { stubDeploymentOrigin, STAGING_DOOR } from '@/lib/deployment-origin.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  claimFindFirst: vi.fn(),
  withTenantContext: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  buildClaimVisibilityWhere: vi.fn(),
  randomBytes: vi.fn(),
  createHash: vi.fn(),
  hashUpdate: vi.fn(),
  hashDigest: vi.fn(),
  withServerActionInstrumentation: vi.fn(
    async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback()
  ),
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: (
    context: unknown,
    action: (tx: Record<string, unknown>) => Promise<unknown>
  ) => {
    hoisted.withTenantContext(context);
    return action({
      query: {
        claims: {
          findFirst: hoisted.claimFindFirst,
        },
      },
      update: hoisted.update,
      insert: hoisted.insert,
    });
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  claims: {
    id: 'claims.id',
  },
  claimTrackingTokens: {
    claimId: 'claimTrackingTokens.claimId',
    tenantId: 'claimTrackingTokens.tenantId',
    revokedAt: 'claimTrackingTokens.revokedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  isNull: vi.fn((value: unknown) => ({ op: 'isNull', value })),
  or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
}));

vi.mock('../utils', () => ({
  buildClaimVisibilityWhere: hoisted.buildClaimVisibilityWhere,
}));

vi.mock('@sentry/nextjs', () => ({
  withServerActionInstrumentation: hoisted.withServerActionInstrumentation,
}));

vi.mock('crypto', () => ({
  default: {
    randomBytes: hoisted.randomBytes,
    createHash: hoisted.createHash,
  },
}));

import { createPublicTrackingLink } from './createPublicTrackingLink';

describe('createPublicTrackingLink', () => {
  const authority = mintTestTenantAuthority('tenant-ks');
  beforeEach(() => {
    vi.clearAllMocks();
    stubDeploymentOrigin();

    hoisted.buildClaimVisibilityWhere.mockReturnValue({ visibility: 'tenant-scope' });
    hoisted.hashDigest.mockReturnValue('hashed-token');
    hoisted.hashUpdate.mockReturnValue({ digest: hoisted.hashDigest });
    hoisted.createHash.mockReturnValue({
      update: hoisted.hashUpdate,
      digest: hoisted.hashDigest,
    });
    hoisted.randomBytes.mockReturnValue(Buffer.from('public-tracking-token-32-bytes!!'));

    hoisted.updateWhere.mockResolvedValue(undefined);
    hoisted.updateSet.mockReturnValue({ where: hoisted.updateWhere });
    hoisted.update.mockReturnValue({ set: hoisted.updateSet });

    hoisted.insertValues.mockResolvedValue(undefined);
    hoisted.insert.mockReturnValue({ values: hoisted.insertValues });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('revokes active same-tenant tokens and legacy null-tenant tokens before inserting a new token', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce({
      id: 'claim-1',
      tenantId: 'tenant-ks',
    });

    const result = await createPublicTrackingLink('claim-1', {
      authority,
      actorUserId: 'staff-1',
      role: 'staff',
      branchId: null,
    });

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(3);
    for (const call of hoisted.withTenantContext.mock.calls) {
      expect(call[0]).toBe(authority);
    }
    expect(hoisted.buildClaimVisibilityWhere).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-ks', userId: 'staff-1', role: 'staff' })
    );
    expect(hoisted.claimFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          op: 'and',
          args: [{ op: 'eq', left: 'claims.id', right: 'claim-1' }, { visibility: 'tenant-scope' }],
        },
        columns: { id: true, tenantId: true },
      })
    );
    expect(hoisted.updateWhere).toHaveBeenCalledWith({
      op: 'and',
      args: [
        {
          op: 'eq',
          left: 'claimTrackingTokens.claimId',
          right: 'claim-1',
        },
        {
          op: 'or',
          args: [
            {
              op: 'eq',
              left: 'claimTrackingTokens.tenantId',
              right: 'tenant-ks',
            },
            {
              op: 'isNull',
              value: 'claimTrackingTokens.tenantId',
            },
          ],
        },
        {
          op: 'isNull',
          value: 'claimTrackingTokens.revokedAt',
        },
      ],
    });
    expect(hoisted.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-ks',
        claimId: 'claim-1',
        tokenHash: 'hashed-token',
        expiresAt: expect.any(Date),
      })
    );
    expect(result.url).toBe(
      `${STAGING_DOOR}/track/${Buffer.from('public-tracking-token-32-bytes!!').toString('base64url')}`
    );
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });

  it('throws when the claim is not visible in the caller tenant', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce(null);

    await expect(
      createPublicTrackingLink('claim-1', {
        authority,
        actorUserId: 'staff-1',
        role: 'staff',
        branchId: null,
      })
    ).rejects.toThrow('Claim not found or access denied');

    expect(hoisted.update).not.toHaveBeenCalled();
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it('rejects invalid origins before revoking or inserting tokens', async () => {
    hoisted.claimFindFirst.mockResolvedValue({ id: 'claim-1', tenantId: 'tenant-ks' });
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ida.interdomestik.com');
    await expect(
      createPublicTrackingLink('claim-1', {
        authority,
        actorUserId: 'staff-1',
        role: 'staff',
        branchId: null,
      })
    ).rejects.toThrow();
    expect(hoisted.randomBytes).not.toHaveBeenCalled();
    expect(hoisted.update).not.toHaveBeenCalled();
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['production', 'https://ida.interdomestik.com'],
    ['staging', STAGING_DOOR],
    ['local', 'http://ida.localhost:3310'],
    ['local', 'https://ida.127.0.0.1.nip.io:3443'],
  ])('uses the %s tracking door across tenant authorities', async (environment, door) => {
    stubDeploymentOrigin(environment, door);
    for (const tenantId of ['tenant_ks', 'tenant_mk', 'tenant_al', 'pilot-mk']) {
      hoisted.claimFindFirst.mockResolvedValue({ id: 'claim-1', tenantId });
      const result = await createPublicTrackingLink('claim-1', {
        authority: mintTestTenantAuthority(tenantId),
        actorUserId: 'staff-1',
        role: 'staff',
        branchId: null,
      });
      expect(result.url).toBe(
        `${door}/track/${Buffer.from('public-tracking-token-32-bytes!!').toString('base64url')}`
      );
      expect(hoisted.insertValues).toHaveBeenLastCalledWith(
        expect.objectContaining({ tenantId, tokenHash: 'hashed-token' })
      );
    }
  });
});
