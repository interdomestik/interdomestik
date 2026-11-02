import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTrackingDrizzleMock, trackingSchemaMock } from './tracking-test-mocks';

const hoisted = vi.hoisted(() => ({
  resolveClaimTrackingTokenTenant: vi.fn(),
  tokenLimit: vi.fn(),
  tokenWhere: vi.fn(),
  txSelect: vi.fn(),
  claimFindFirst: vi.fn(),
  createHash: vi.fn(),
  hashUpdate: vi.fn(),
  hashDigest: vi.fn(),
  withTenantContext: vi.fn(),
  withServerActionInstrumentation: vi.fn(
    async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback()
  ),
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContext,
}));

vi.mock('@interdomestik/database/public-token-tenant', () => ({
  resolveClaimTrackingTokenTenant: hoisted.resolveClaimTrackingTokenTenant,
}));

vi.mock('@interdomestik/database/schema', () => ({
  claims: {
    id: trackingSchemaMock.claims.id,
    tenantId: trackingSchemaMock.claims.tenantId,
  },
  claimTrackingTokens: trackingSchemaMock.claimTrackingTokens,
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

const validTokenRow = [{ id: 'token-1' }];

describe('getPublicClaimStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveClaimTrackingTokenTenant.mockResolvedValue({
      tenantId: 'tenant-ks',
      claimId: 'claim-1',
    });
    hoisted.tokenLimit.mockResolvedValue(validTokenRow);
    hoisted.tokenWhere.mockReturnValue({ limit: hoisted.tokenLimit });
    hoisted.txSelect.mockReturnValue({
      from: vi.fn(() => ({ where: hoisted.tokenWhere })),
    });
    hoisted.withTenantContext.mockImplementation(
      async (_context: unknown, callback: (tx: unknown) => unknown) =>
        callback({
          select: hoisted.txSelect,
          query: { claims: { findFirst: hoisted.claimFindFirst } },
        })
    );
    hoisted.hashDigest.mockReturnValue('hashed-token');
    hoisted.hashUpdate.mockReturnValue({ digest: hoisted.hashDigest });
    hoisted.createHash.mockReturnValue({
      update: hoisted.hashUpdate,
      digest: hoisted.hashDigest,
    });
  });

  it('returns null without entering a tenant context when the resolver finds no active token', async () => {
    hoisted.resolveClaimTrackingTokenTenant.mockResolvedValueOnce(null);

    const result = await getPublicClaimStatus('public-token');

    expect(result).toBeNull();
    expect(hoisted.resolveClaimTrackingTokenTenant).toHaveBeenCalledWith(
      'public-token',
      expect.any(Date)
    );
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.txSelect).not.toHaveBeenCalled();
    expect(hoisted.claimFindFirst).not.toHaveBeenCalled();
  });

  it('returns null without reading the claim when the token is no longer valid in the resolved tenant', async () => {
    hoisted.tokenLimit.mockResolvedValueOnce([]);

    const result = await getPublicClaimStatus('public-token');

    expect(result).toBeNull();
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.txSelect).toHaveBeenCalledTimes(1);
    expect(hoisted.claimFindFirst).not.toHaveBeenCalled();
  });

  it('revalidates the token inside the resolved tenant with unrevoked, unexpired and tenant-bound predicates', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce(null);

    await getPublicClaimStatus('public-token');

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-ks' },
      expect.any(Function)
    );
    expect(hoisted.tokenWhere).toHaveBeenCalledWith({
      op: 'and',
      args: [
        { op: 'eq', left: 'claimTrackingTokens.tenantId', right: 'tenant-ks' },
        { op: 'eq', left: 'claimTrackingTokens.claimId', right: 'claim-1' },
        { op: 'eq', left: 'claimTrackingTokens.tokenHash', right: 'hashed-token' },
        { op: 'gt', left: 'claimTrackingTokens.expiresAt', right: expect.any(Date) },
        { op: 'isNull', value: 'claimTrackingTokens.revokedAt' },
      ],
    });
    expect(hoisted.tokenLimit).toHaveBeenCalledWith(1);
  });

  it('returns null when the claim lookup does not match the token tenant', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce(null);

    const result = await getPublicClaimStatus('public-token');

    expect(result).toBeNull();
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-ks' },
      expect.any(Function)
    );
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

  it('returns lifecycle-derived public status when compat status differs', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce({
      caseLifecycleState: 'resolved',
      id: 'claim-1',
      recoveryLifecycleState: 'resolved',
      status: 'submitted',
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    });

    const result = await getPublicClaimStatus('public-token');

    expect(result?.status).toBe('resolved');
    expect(result?.statusLabelKey).toBe('claims-tracking.status.resolved');
  });
});
