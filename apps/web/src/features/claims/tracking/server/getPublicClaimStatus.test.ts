import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    id: 'claims.id',
    tenantId: 'claims.tenantId',
  },
  claimTrackingTokens: {
    tokenHash: 'claimTrackingTokens.tokenHash',
    expiresAt: 'claimTrackingTokens.expiresAt',
    revokedAt: 'claimTrackingTokens.revokedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  gt: vi.fn((left: unknown, right: unknown) => ({ op: 'gt', left, right })),
  isNull: vi.fn((value: unknown) => ({ op: 'isNull', value })),
}));

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
});
