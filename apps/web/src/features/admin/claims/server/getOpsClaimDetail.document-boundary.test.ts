import { beforeEach, describe, expect, it } from 'vitest';
import {
  hoisted,
  mockSelectChains,
  opsAuthority,
  resetOpsClaimDetailMocks,
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
    const { docsWhere } = mockSelectChains();
    docsWhere.mockResolvedValueOnce([{ count: 2 }]);

    const result = await getOpsClaimDetail(
      'claim-1',
      opsAuthority({ id: 'manager-1', role: 'branch_manager' })
    );

    expect(result).toMatchObject({
      kind: 'ok',
      data: { docs: [], documentSummary: { count: 2, evidenceComplete: null } },
    });
    expect(hoisted.signDocument).not.toHaveBeenCalled();
    const projection = hoisted.dbSelect.mock.calls[0]?.[0];
    expect(Object.keys(projection)).toEqual(['count']);
  });

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'preserves %s signing and metadata',
    async role => {
      hoisted.getSession.mockResolvedValue({
        user: { id: 'admin-1', role, tenantId: 'tenant_ks' },
      });
      const { docsWhere } = mockSelectChains();
      docsWhere.mockResolvedValueOnce([
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

      const result = await getOpsClaimDetail('claim-1', opsAuthority({ role }));

      expect(result).toMatchObject({
        kind: 'ok',
        data: { docs: [{ id: 'doc-1', name: 'evidence.pdf', url: 'signed-document-url' }] },
      });
      expect(hoisted.signDocument).toHaveBeenCalledOnce();
    }
  );

  it.each(['staff', 'member'])('preserves the existing %s Ops-detail denial', async role => {
    hoisted.getSession.mockResolvedValue({ user: { id: 'actor-1', role, tenantId: 'tenant_ks' } });
    await expect(
      getOpsClaimDetail('claim-1', opsAuthority({ id: 'actor-1', role }))
    ).resolves.toEqual({ kind: 'not_found' });
    expect(hoisted.signDocument).not.toHaveBeenCalled();
  });
});
