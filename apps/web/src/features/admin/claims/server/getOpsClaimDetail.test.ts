import { beforeEach, describe, expect, it } from 'vitest';
// The fixture registers module mocks, so it must be imported before the subject.
import {
  hoisted,
  mockSelectChains,
  readContexts,
  resetOpsClaimDetailMocks,
  sqlOf,
  visibleClaimSql,
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
    expect(readContexts()).toEqual([
      { tenantId: 'tenant_ks', role: 'admin' },
      { tenantId: 'tenant_home', role: 'admin' },
    ]);
  });

  it('returns not_found when host is unknown and not allowlisted', async () => {
    hoisted.headersFn.mockResolvedValueOnce(new Headers([['host', 'example.test']]));

    const result = await getOpsClaimDetail('claim-1');

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.visibleClaimFrom).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('returns not_found when host tenant and access tenant mismatch', async () => {
    hoisted.headersFn.mockResolvedValueOnce(new Headers([['host', 'mk.localhost:3000']]));

    const result = await getOpsClaimDetail('claim-1');

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.visibleClaimFrom).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('returns not_found when tenant context is missing from session', async () => {
    hoisted.getSession.mockResolvedValueOnce({ user: { id: 'admin-1', role: 'admin' } });

    const result = await getOpsClaimDetail('claim-1');

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.visibleClaimFrom).not.toHaveBeenCalled();
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
    expect(hoisted.visibleClaimFrom).not.toHaveBeenCalled();
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
    hoisted.visibleClaimFrom.mockResolvedValueOnce([]);

    const result = await getOpsClaimDetail('claim-1');

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(visibleClaimSql().params).toContain('branch-2');
  });

  it('applies access tenant predicate on claim and document reads', async () => {
    const { docsWhere, noteWhere } = mockSelectChains();
    const result = await getOpsClaimDetail('claim-1');
    expect(result.kind).toBe('ok');
    const claimWhere = visibleClaimSql();
    expect(claimWhere.sql).toMatch(/"access_tenant_id" is null/);
    expect(claimWhere.params).toEqual(['tenant_ks', 'tenant_ks', 'claim-1']);
    const documentScopes = docsWhere.mock.calls.map(([where]) => sqlOf(where));
    expect(documentScopes).toHaveLength(2);
    expect(documentScopes[0].sql).toContain('"claim_documents"."access_tenant_id" =');
    expect(documentScopes[1].sql).toContain('"claim_documents"."access_tenant_id" is null');
    for (const scope of documentScopes) {
      expect(scope.sql).toContain('exists (select "id",');
      expect(scope.sql).toContain('from "claim"');
      expect(scope.params).toEqual(['tenant_ks', 'claim-1', ...claimWhere.params]);
    }
    expect(sqlOf(noteWhere.mock.lastCall?.[0]).params).toEqual(['claim-1', 'tenant_home']);
  });

  it('executes reads under tenant context', async () => {
    mockSelectChains();
    await getOpsClaimDetail('claim-1');
    expect(readContexts()).toEqual([
      { tenantId: 'tenant_ks', role: 'admin' },
      { tenantId: 'tenant_home', role: 'admin' },
    ]);
  });

  it('ignores caller identity when the real session belongs to an unauthorized user', async () => {
    hoisted.getSession.mockResolvedValueOnce({
      user: { id: 'member-1', role: 'member', tenantId: 'tenant_ks' },
    });
    const injected = {
      documentsAfter: 'doc-1',
      userId: 'admin-1',
      tenantId: 'tenant_mk',
      role: 'admin',
    };
    await expect(getOpsClaimDetail('claim-1', injected)).resolves.toEqual({ kind: 'not_found' });
    expect(hoisted.visibleClaimFrom).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('uses one verified session for detail, document continuation and staff search', async () => {
    const { docsWhere, docsRows } = mockSelectChains();
    docsRows.limit.mockResolvedValueOnce(
      Array.from({ length: 26 }, (_, index) => ({
        id: `doc-${index + 1}`,
        name: 'Proof',
        tenantId: 'tenant_home',
        bucket: 'claim-evidence',
        filePath: 'private/proof',
      }))
    );
    const result = await getOpsClaimDetail('claim-1', {
      documentsAfter: 'doc-0',
      staffAfter: 'staff-0',
      staffSearch: 'Alex',
    });
    expect(result).toMatchObject({ kind: 'ok', documentsNextCursor: 'doc-25' });
    expect(hoisted.getSession).toHaveBeenCalledTimes(1);
    expect(docsRows.limit).toHaveBeenCalledWith(26);
    expect(hoisted.signDocument).toHaveBeenCalledTimes(25);
    expect(sqlOf(docsWhere.mock.lastCall?.[0]).params).toContain('doc-0');
    expect(hoisted.searchAssignableStaff).toHaveBeenCalledWith(expect.anything(), {
      authority: hoisted.withTenantContext.mock.calls[0][0],
      search: 'Alex',
      afterId: 'staff-0',
    });
  });

  it('surfaces staff and session dependency failures', async () => {
    mockSelectChains();
    hoisted.searchAssignableStaff.mockRejectedValueOnce(new Error('Staff read unavailable'));
    await expect(getOpsClaimDetail('claim-1')).rejects.toThrow('Staff read unavailable');
    hoisted.getSession.mockRejectedValueOnce(new Error('Session unavailable'));
    await expect(getOpsClaimDetail('claim-1')).rejects.toThrow('Session unavailable');
  });

  it('reads home details only under the delegated home-tenant authority', async () => {
    mockSelectChains();
    await getOpsClaimDetail('claim-1');
    const authority = hoisted.withTenantContext.mock.calls[0]?.[0];
    expect(hoisted.delegateClaimHomeTenantRead).toHaveBeenCalledWith(authority, 'claim-1');
    expect(hoisted.withTenantContext.mock.calls[0]?.[0]).toBe(authority);
  });

  it('reads no home rows when the home delegation is refused', async () => {
    const { docsWhere } = mockSelectChains();
    hoisted.delegateClaimHomeTenantRead.mockResolvedValueOnce(null);

    const result = await getOpsClaimDetail('claim-1');

    expect(result.kind).toBe('ok');
    expect(docsWhere).toHaveBeenCalledTimes(2);
    expect(readContexts()).toEqual([{ tenantId: 'tenant_ks', role: 'admin' }]);
    expect(hoisted.dbSelect).toHaveBeenCalledTimes(3);
  });
});
