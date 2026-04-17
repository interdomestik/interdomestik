import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTrackingDrizzleMock, trackingSchemaMock } from './tracking-test-mocks';

const hoisted = vi.hoisted(() => ({
  tokenFindFirst: vi.fn(),
  claimFindFirst: vi.fn(),
  createHash: vi.fn(),
  hashUpdate: vi.fn(),
  hashDigest: vi.fn(),
  withServerActionInstrumentation: vi.fn(
    async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback()
  ),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claimTrackingTokens: {
        findFirst: hoisted.tokenFindFirst,
      },
      claims: {
        findFirst: hoisted.claimFindFirst,
      },
    },
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  claims: {
    id: trackingSchemaMock.claims.id,
    tenantId: trackingSchemaMock.claims.tenantId,
  },
  claimTrackingTokens: {
    tokenHash: trackingSchemaMock.claimTrackingTokens.tokenHash,
    expiresAt: trackingSchemaMock.claimTrackingTokens.expiresAt,
    revokedAt: trackingSchemaMock.claimTrackingTokens.revokedAt,
  },
}));

vi.mock('drizzle-orm', () => createTrackingDrizzleMock());

vi.mock('@sentry/nextjs', () => ({
  withServerActionInstrumentation: hoisted.withServerActionInstrumentation,
}));

vi.mock('crypto', () => ({
  default: {
    createHash: hoisted.createHash,
  },
}));

import { getPublicClaimStatus } from './getPublicClaimStatus';

describe('getPublicClaimStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.hashDigest.mockReturnValue('hashed-token');
    hoisted.hashUpdate.mockReturnValue({ digest: hoisted.hashDigest });
    hoisted.createHash.mockReturnValue({
      update: hoisted.hashUpdate,
      digest: hoisted.hashDigest,
    });
  });

  it('returns null when no active token record exists and scopes lookup to unrevoked tokens', async () => {
    hoisted.tokenFindFirst.mockResolvedValueOnce(null);

    const result = await getPublicClaimStatus('public-token');

    expect(result).toBeNull();
    expect(hoisted.tokenFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          op: 'and',
          args: [
            {
              op: 'eq',
              left: 'claimTrackingTokens.tokenHash',
              right: 'hashed-token',
            },
            {
              op: 'gt',
              left: 'claimTrackingTokens.expiresAt',
              right: expect.any(Date),
            },
            {
              op: 'isNull',
              value: 'claimTrackingTokens.revokedAt',
            },
          ],
        },
      })
    );
  });

  it('returns null when the claim lookup does not match the token tenant', async () => {
    hoisted.tokenFindFirst.mockResolvedValueOnce({
      claimId: 'claim-1',
      tenantId: 'tenant-ks',
    });
    hoisted.claimFindFirst.mockResolvedValueOnce(null);

    const result = await getPublicClaimStatus('public-token');

    expect(result).toBeNull();
    expect(hoisted.claimFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          op: 'and',
          args: [
            { op: 'eq', left: 'claims.id', right: 'claim-1' },
            { op: 'eq', left: 'claims.tenantId', right: 'tenant-ks' },
          ],
        },
      })
    );
  });

  it('returns null without querying claims when the token tenant is missing', async () => {
    hoisted.tokenFindFirst.mockResolvedValueOnce({
      claimId: 'claim-legacy',
      tenantId: null,
    });

    const result = await getPublicClaimStatus('public-token');

    expect(result).toBeNull();
    expect(hoisted.claimFindFirst).not.toHaveBeenCalled();
  });
});
