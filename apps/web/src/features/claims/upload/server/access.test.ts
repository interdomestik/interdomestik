import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  findClaimFirst: vi.fn(),
  requestLimit: vi.fn(),
  requestWhere: vi.fn(),
  requestInnerJoin: vi.fn(),
  requestFrom: vi.fn(),
  requestSelect: vi.fn(),
  withTenantContext: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: {
        findFirst: hoisted.findClaimFirst,
      },
    },
  },
  claims: {
    id: 'claims.id',
    tenantId: 'claims.tenant_id',
    userId: 'claims.user_id',
  },
  claimInformationRequests: {
    id: 'claim_information_requests.id',
    claimId: 'claim_information_requests.claim_id',
    tenantId: 'claim_information_requests.tenant_id',
    status: 'claim_information_requests.status',
  },
  withTenantContext: hoisted.withTenantContext,
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
}));

import {
  canAccessClaimFromAdminUploadSurface,
  findOwnedMemberInformationRequest,
  findOwnedMemberUploadClaim,
} from './access';

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.requestSelect.mockReturnValue({ from: hoisted.requestFrom });
  hoisted.requestFrom.mockReturnValue({ innerJoin: hoisted.requestInnerJoin });
  hoisted.requestInnerJoin.mockReturnValue({ where: hoisted.requestWhere });
  hoisted.requestWhere.mockReturnValue({ limit: hoisted.requestLimit });
  hoisted.withTenantContext.mockImplementation(async (_context, action) =>
    action({ select: hoisted.requestSelect })
  );
});

describe('canAccessClaimFromAdminUploadSurface', () => {
  it('allows assigned staff even when the claim branch differs', () => {
    expect(
      canAccessClaimFromAdminUploadSurface({
        branchId: 'branch-2',
        claim: { branchId: 'branch-1', staffId: 'staff-2' },
        role: 'staff',
        userId: 'staff-2',
      })
    ).toBe(true);
  });

  it('denies staff outside both branch and assignment scope', () => {
    expect(
      canAccessClaimFromAdminUploadSurface({
        branchId: 'branch-2',
        claim: { branchId: 'branch-1', staffId: 'staff-1' },
        role: 'staff',
        userId: 'staff-2',
      })
    ).toBe(false);
  });

  it('denies branch managers outside their branch scope', () => {
    expect(
      canAccessClaimFromAdminUploadSurface({
        branchId: 'branch-2',
        claim: { branchId: 'branch-1', staffId: null },
        role: 'branch_manager',
        userId: 'manager-1',
      })
    ).toBe(false);
  });

  it('scopes member upload lookup to claim, tenant, and owning member', async () => {
    hoisted.findClaimFirst.mockResolvedValueOnce({ id: 'claim-1' });

    await expect(
      findOwnedMemberUploadClaim({
        claimId: 'claim-1',
        tenantId: 'tenant-1',
        userId: 'member-1',
      })
    ).resolves.toEqual({ id: 'claim-1' });

    expect(hoisted.findClaimFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        op: 'and',
        args: expect.arrayContaining([
          expect.objectContaining({ op: 'eq', left: 'claims.id', right: 'claim-1' }),
          expect.objectContaining({ op: 'eq', left: 'claims.tenant_id', right: 'tenant-1' }),
          expect.objectContaining({ op: 'eq', left: 'claims.user_id', right: 'member-1' }),
        ]),
      }),
      columns: { id: true },
    });
  });

  it('looks up the owned information request inside the member tenant context', async () => {
    hoisted.requestLimit.mockResolvedValueOnce([{ id: 'request-1' }]);

    await expect(
      findOwnedMemberInformationRequest({
        claimId: 'claim-1',
        informationRequestId: 'request-1',
        tenantId: 'tenant-1',
        userId: 'member-1',
      })
    ).resolves.toEqual({ id: 'request-1' });

    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', role: 'member' },
      expect.any(Function)
    );
    expect(hoisted.requestSelect).toHaveBeenCalledWith({
      id: 'claim_information_requests.id',
    });
  });
});
