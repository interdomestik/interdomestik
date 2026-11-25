import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  claimLock: vi.fn(),
  claimWhere: vi.fn(),
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
      select: () => ({ from: () => ({ where: hoisted.claimWhere }) }),
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
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalBetterAuthUrl = process.env.BETTER_AUTH_URL;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalVercelUrl = process.env.VERCEL_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = 'https://portal.example';

    hoisted.claimWhere.mockReturnValue({ for: hoisted.claimLock });
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
    hoisted.claimLock.mockResolvedValueOnce([{ id: 'claim-1' }]);

    const result = await createPublicTrackingLink('claim-1', {
      authority,
      actorUserId: 'staff-1',
      role: 'staff',
      branchId: null,
    });

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    for (const call of hoisted.withTenantContext.mock.calls) {
      expect(call[0]).toBe(authority);
    }
    expect(hoisted.buildClaimVisibilityWhere).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-ks', userId: 'staff-1', role: 'staff' })
    );
    expect(hoisted.claimWhere).toHaveBeenCalledWith({
      op: 'and',
      args: [{ op: 'eq', left: 'claims.id', right: 'claim-1' }, { visibility: 'tenant-scope' }],
    });
    expect(hoisted.claimLock).toHaveBeenCalledWith('update', { noWait: true });
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
    expect('url' in result && result.url).toMatch(/^https:\/\/portal\.example\/track\//);
  });

  it('refuses when the claim is not visible in the caller tenant', async () => {
    hoisted.claimLock.mockResolvedValueOnce([]);

    await expect(
      createPublicTrackingLink('claim-1', {
        authority,
        actorUserId: 'staff-1',
        role: 'staff',
        branchId: null,
      })
    ).resolves.toEqual({ code: 'NOT_FOUND' });

    expect(hoisted.update).not.toHaveBeenCalled();
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it('returns conflict without writing when another replacement holds the claim lock', async () => {
    hoisted.claimLock.mockRejectedValueOnce(
      new Error('query failed', { cause: { code: '55P03' } })
    );
    await expect(
      createPublicTrackingLink('claim-1', {
        authority,
        actorUserId: 'staff-1',
        role: 'staff',
        branchId: null,
      })
    ).resolves.toEqual({ code: 'conflict' });
    expect(hoisted.update).not.toHaveBeenCalled();
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it('propagates the insert error out of the transaction after revocation', async () => {
    const failure = new Error('insert failed');
    hoisted.claimLock.mockResolvedValueOnce([{ id: 'claim-1' }]);
    hoisted.insertValues.mockRejectedValueOnce(failure);
    await expect(
      createPublicTrackingLink('claim-1', {
        authority,
        actorUserId: 'staff-1',
        role: 'staff',
        branchId: null,
      })
    ).rejects.toBe(failure);
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.updateWhere).toHaveBeenCalledBefore(hoisted.insertValues);
  });

  it('does not fall back to localhost for production tracking links', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.BETTER_AUTH_URL;
    delete process.env.VERCEL_URL;
    process.env.VERCEL_ENV = 'production';

    hoisted.claimLock.mockResolvedValueOnce([{ id: 'claim-1' }]);

    const result = await createPublicTrackingLink('claim-1', {
      authority,
      actorUserId: 'staff-1',
      role: 'staff',
      branchId: null,
    });

    expect('url' in result && result.url).toMatch(/^https:\/\/www\.interdomestik\.com\/track\//);
    expect('url' in result && result.url).not.toContain('localhost');
  });
});
