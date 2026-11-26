import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hoisted,
  mockSelectChains,
  resetOpsClaimDetailMocks,
  sqlOf,
} from './getOpsClaimDetail.test-fixtures';
import { getOpsClaimDetail } from './getOpsClaimDetail';

describe('D1 Ops document boundary', () => {
  beforeEach(resetOpsClaimDetailMocks);

  it('returns only a count and unknown completeness for a manager, without signing', async () => {
    hoisted.getSession.mockResolvedValue({
      user: {
        id: 'manager-1',
        role: 'branch_manager',
        tenantId: 'tenant_ks',
        branchId: 'branch-a',
      },
    });
    const { docsUnion, docsWhere } = mockSelectChains();
    docsUnion.mockResolvedValueOnce([{ count: 1 }, { count: 1 }]);

    const result = await getOpsClaimDetail('claim-1');
    expect(hoisted.searchAssignableStaff).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      kind: 'ok',
      data: { docs: [], documentSummary: { count: 2, evidenceComplete: null } },
    });
    expect(hoisted.signDocument).not.toHaveBeenCalled();
    const projections = hoisted.dbSelect.mock.calls
      .slice(1, 3)
      .map(([fields]) => Object.keys(fields));
    expect(projections).toEqual([['count'], ['count']]);
    const scopes = docsWhere.mock.calls.map(([where]) => sqlOf(where));
    expect(scopes).toHaveLength(2);
    expect(scopes[0].sql).toContain('"claim_documents"."access_tenant_id" =');
    expect(scopes[1].sql).toContain('"claim_documents"."access_tenant_id" is null');
    for (const scope of scopes) {
      expect(scope.sql).toContain('exists (select');
      expect(scope.sql).toContain('"claim"."branch_id" =');
      expect(scope.params).toEqual([
        'tenant_ks',
        'claim-1',
        'tenant_ks',
        'tenant_ks',
        'claim-1',
        'branch-a',
      ]);
    }
  });

  it('isolates invalid legacy and failed signatures without leaking document data', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { docsRows } = mockSelectChains();
    docsRows.limit.mockResolvedValueOnce(
      ['legacy', 'broken', 'valid'].map(id => ({
        id,
        name: `${id}.pdf`,
        tenantId: 'tenant_ks',
        bucket: 'claim-evidence',
        filePath: `private/${id}`,
        fileSize: 100,
        fileType: 'application/pdf',
        createdAt: null,
      }))
    );
    hoisted.signDocument
      .mockRejectedValueOnce(new Error('private path and identity'))
      .mockResolvedValueOnce({ data: null, error: new Error('private provider failure') });
    const result = await getOpsClaimDetail('claim-1');
    expect(result).toMatchObject({
      kind: 'ok',
      data: {
        docs: [
          { id: 'legacy', url: '' },
          { id: 'broken', url: '' },
          { id: 'valid', url: 'signed-document-url' },
        ],
      },
    });
    expect(warning).toHaveBeenCalledOnce();
    expect(JSON.stringify(warning.mock.calls)).not.toMatch(
      /private|tenant_ks|legacy|broken|claim-1/
    );
    warning.mockRestore();
  });

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'preserves %s signing and metadata',
    async role => {
      hoisted.getSession.mockResolvedValue({
        user: { id: 'admin-1', role, tenantId: 'tenant_ks' },
      });
      const { docsRows } = mockSelectChains();
      docsRows.limit.mockResolvedValueOnce([
        {
          id: 'doc-1',
          name: 'evidence.pdf',
          tenantId: 'tenant_ks',
          bucket: 'claim-evidence',
          filePath: 'pii/tenants/tenant_ks/claims/claim-1/evidence.pdf',
          fileSize: 100,
          fileType: 'application/pdf',
          createdAt: null,
        },
      ]);

      const result = await getOpsClaimDetail('claim-1');

      expect(result).toMatchObject({
        kind: 'ok',
        data: { docs: [{ id: 'doc-1', name: 'evidence.pdf', url: 'signed-document-url' }] },
      });
      expect(hoisted.signDocument).toHaveBeenCalledOnce();
    }
  );

  it.each(['staff', 'member'])('preserves the existing %s Ops-detail denial', async role => {
    hoisted.getSession.mockResolvedValue({ user: { id: 'actor-1', role, tenantId: 'tenant_ks' } });
    await expect(getOpsClaimDetail('claim-1')).resolves.toEqual({ kind: 'not_found' });
    expect(hoisted.signDocument).not.toHaveBeenCalled();
  });
});
