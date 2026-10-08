import { beforeEach, describe, expect, it } from 'vitest';
// The fixture registers module mocks, so it must be imported before the subject.
import {
  hoisted,
  mockSelectChains,
  resetOpsClaimDetailMocks,
} from './getOpsClaimDetail.test-fixtures';
import { getOpsClaimDetail } from './getOpsClaimDetail';

describe('getOpsClaimDetail', () => {
  beforeEach(() => {
    resetOpsClaimDetailMocks();
  });

  it('falls back to session tenant when the deployment host is generic', async () => {
    hoisted.headersFn.mockResolvedValueOnce(
      new Headers([['host', 'interdomestik-web.vercel.app']])
    );
    mockSelectChains();

    const result = await getOpsClaimDetail('claim-1');

    expect(result.kind).toBe('ok');
    expect(hoisted.withTenantContext.mock.calls.map(call => call[0])).toEqual([
      expect.objectContaining({ tenantId: 'tenant_ks', role: 'admin' }),
      expect.objectContaining({ tenantId: 'tenant_home', role: 'admin' }),
    ]);
  });

  it('returns not_found when host is unknown and not allowlisted', async () => {
    hoisted.headersFn.mockResolvedValueOnce(new Headers([['host', 'example.test']]));

    const result = await getOpsClaimDetail('claim-1');

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.claimsFindFirst).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('returns not_found when host tenant and access tenant mismatch', async () => {
    hoisted.headersFn.mockResolvedValueOnce(new Headers([['host', 'mk.localhost:3000']]));

    const result = await getOpsClaimDetail('claim-1');

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.claimsFindFirst).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('returns not_found when tenant context is missing from session', async () => {
    hoisted.ensureTenantId.mockImplementationOnce(() => {
      throw new Error('Missing tenant');
    });

    const result = await getOpsClaimDetail('claim-1');

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.claimsFindFirst).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('returns not_found when the caller lacks admin claims visibility', async () => {
    hoisted.getSession.mockResolvedValueOnce({
      user: {
        id: 'member-1',
        tenantId: 'tenant_ks',
        role: 'member',
      },
    });

    const result = await getOpsClaimDetail('claim-1');

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.claimsFindFirst).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('applies branch scope for branch managers before loading claim detail', async () => {
    hoisted.getSession.mockResolvedValueOnce({
      user: {
        id: 'manager-1',
        tenantId: 'tenant_ks',
        role: 'branch_manager',
        branchId: 'branch-2',
      },
    });
    hoisted.claimsFindFirst.mockResolvedValueOnce(undefined);

    const result = await getOpsClaimDetail('claim-1');

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.eq).toHaveBeenCalledWith('claims.branchId', 'branch-2');
  });

  it('applies access tenant predicate on claim and document reads', async () => {
    const { docsWhere, noteWhere } = mockSelectChains();
    const result = await getOpsClaimDetail('claim-1');
    expect(result.kind).toBe('ok');
    expect(hoisted.matchesAccessTenant).toHaveBeenCalledTimes(2);
    expect(String(docsWhere.mock.calls[0]?.[0] ?? '')).toContain('access:tenant_ks');
    expect(String(noteWhere.mock.calls[0]?.[0] ?? '')).toContain(
      'eq:claimStageHistory.tenantId:tenant_home'
    );
    expect(hoisted.eq).toHaveBeenCalledWith('user.tenantId', 'tenant_home');
  });

  it('executes reads under tenant context', async () => {
    mockSelectChains();
    await getOpsClaimDetail('claim-1');
    expect(hoisted.withTenantContext.mock.calls.map(call => call[0])).toEqual([
      expect.objectContaining({ tenantId: 'tenant_ks', role: 'admin' }),
      expect.objectContaining({ tenantId: 'tenant_home', role: 'admin' }),
    ]);
  });
});
