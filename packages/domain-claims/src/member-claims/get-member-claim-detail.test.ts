import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withTenantContext } from '@interdomestik/database';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { UnauthorizedError } from '@interdomestik/shared-auth';
import { getMemberClaimDetail, getMemberClaimTitle } from './get-member-claim-detail';

const mocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };

  return {
    db: { select: vi.fn() },
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      userId: 'claims.user_id',
      claimNumber: 'claims.claim_number',
      status: 'claims.status',
      caseLifecycleState: 'claims.case_lifecycle_state',
      recoveryLifecycleState: 'claims.recovery_lifecycle_state',
      createdAt: 'claims.created_at',
      updatedAt: 'claims.updated_at',
    },
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
    getClaimTimeline: vi.fn(),
    getClaimStatus: vi.fn(),
    selectChain,
  };
});

vi.mock('@interdomestik/database', () => ({
  db: mocks.db,
  withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: typeof mocks.db) => unknown) =>
    cb(mocks.db)
  ),
  claims: mocks.claims,
  eq: mocks.eq,
  and: mocks.and,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/database/tenant-authority', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database/tenant-authority')>();
  return { ...actual, readTenantAuthority: vi.fn(actual.readTenantAuthority) };
});

vi.mock('../staff-claims/get-claim-timeline', () => ({
  getClaimTimeline: mocks.getClaimTimeline,
}));

vi.mock('../staff-claims/get-claim-status', () => ({
  getClaimStatus: mocks.getClaimStatus,
}));

describe('getMemberClaimDetail', () => {
  const authority = mintTestTenantAuthority('tenant-1');

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.select.mockReturnValue(mocks.selectChain);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
  });

  it('reads current status from lifecycle fields when they are present', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      {
        id: 'claim-1',
        claimNumber: 'MK-100',
        status: 'submitted',
        caseLifecycleState: 'evaluation',
        recoveryLifecycleState: 'not_started',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        updatedAt: new Date('2026-02-02T00:00:00.000Z'),
      },
    ]);

    const result = await getMemberClaimDetail({
      authority,
      memberId: 'member-1',
      claimId: 'claim-1',
    });

    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(result?.status).toBe('evaluation');
    expect(mocks.getClaimStatus).not.toHaveBeenCalled();
    expect(mocks.getClaimTimeline).not.toHaveBeenCalled();
  });

  it('uses lifecycle status over a mismatched compat status', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      {
        id: 'claim-1',
        claimNumber: 'MK-101',
        status: 'submitted',
        caseLifecycleState: 'resolved',
        recoveryLifecycleState: 'resolved',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        updatedAt: new Date('2026-02-03T00:00:00.000Z'),
      },
    ]);

    const result = await getMemberClaimDetail({
      authority,
      memberId: 'member-1',
      claimId: 'claim-1',
    });

    expect(result?.status).toBe('resolved');
  });

  it('falls back to claim row status when timeline is empty', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      {
        id: 'claim-1',
        claimNumber: 'MK-102',
        status: 'submitted',
        caseLifecycleState: null,
        recoveryLifecycleState: null,
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        updatedAt: new Date('2026-02-03T00:00:00.000Z'),
      },
    ]);

    const result = await getMemberClaimDetail({
      authority,
      memberId: 'member-1',
      claimId: 'claim-1',
    });

    expect(result?.status).toBe('submitted');
    expect(mocks.getClaimStatus).not.toHaveBeenCalled();
  });
});

describe('getMemberClaimTitle', () => {
  it.each([
    { purpose: 'test', role: 'member' },
    { purpose: 'session', role: 'staff' },
  ] as const)(
    'refuses $purpose/$role authority before reading claims',
    async ({ purpose, role }) => {
      vi.clearAllMocks();
      const authority = mintTestTenantAuthority('tenant-1', { userId: 'user-1', role });
      vi.mocked(readTenantAuthority).mockReturnValueOnce({
        ...readTenantAuthority(authority),
        purpose,
      });

      await expect(getMemberClaimTitle({ authority, claimId: 'claim-1' })).rejects.toThrow(
        UnauthorizedError
      );
      expect(withTenantContext).not.toHaveBeenCalled();
    }
  );
});
