import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  claimFindFirst: vi.fn(),
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
  db: {
    query: {
      claims: {
        findFirst: hoisted.claimFindFirst,
      },
    },
    update: hoisted.update,
    insert: hoisted.insert,
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
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalBetterAuthUrl = process.env.BETTER_AUTH_URL;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalVercelUrl = process.env.VERCEL_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = 'https://portal.example';

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

  afterEach(() => {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }

    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;

    if (originalBetterAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = originalBetterAuthUrl;

    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;

    if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = originalVercelUrl;
  });

  it('revokes active same-tenant tokens and legacy null-tenant tokens before inserting a new token', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce({
      id: 'claim-1',
      tenantId: 'tenant-ks',
    });

    const result = await createPublicTrackingLink('claim-1', {
      tenantId: 'tenant-ks',
      actorUserId: 'staff-1',
      role: 'staff',
      branchId: null,
    });

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
    expect(result.url).toMatch(/^https:\/\/portal\.example\/track\//);
  });

  it('throws when the claim is not visible in the caller tenant', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce(null);

    await expect(
      createPublicTrackingLink('claim-1', {
        tenantId: 'tenant-ks',
        actorUserId: 'staff-1',
        role: 'staff',
        branchId: null,
      })
    ).rejects.toThrow('Claim not found or access denied');

    expect(hoisted.update).not.toHaveBeenCalled();
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it('does not fall back to localhost for production tracking links', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.BETTER_AUTH_URL;
    delete process.env.VERCEL_URL;
    process.env.VERCEL_ENV = 'production';

    hoisted.claimFindFirst.mockResolvedValueOnce({
      id: 'claim-1',
      tenantId: 'tenant-ks',
    });

    const result = await createPublicTrackingLink('claim-1', {
      tenantId: 'tenant-ks',
      actorUserId: 'staff-1',
      role: 'staff',
      branchId: null,
    });

    expect(result.url).toMatch(/^https:\/\/www\.interdomestik\.com\/track\//);
    expect(result.url).not.toContain('localhost');
  });
});
