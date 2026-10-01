import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStaffClaimsListMocks } from './get-staff-claims-list.test-support';
const { mocks, modules } = await vi.hoisted(async () => {
  const { createStaffClaimsListMocks, createStaffClaimsListModuleMocks } =
    await import('./get-staff-claims-list.test-support');
  const mocks = createStaffClaimsListMocks();
  return { mocks, modules: createStaffClaimsListModuleMocks(mocks) };
});
vi.mock('@interdomestik/database', () => modules.database);
vi.mock('@interdomestik/database/tenant-security', () => modules.tenantSecurity);
vi.mock('drizzle-orm', () => modules.drizzle);

import { getStaffClaimsList } from './get-staff-claims-list';
import { VALID_DIASPORA_ORIGIN_NOTES } from './staff-claims-diaspora-origin-notes';

describe('staff claims history projection', () => {
  beforeEach(() => resetStaffClaimsListMocks(mocks));

  it('does not run the history query when the claims page is empty', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    await getStaffClaimsList({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
      limit: 20,
    });

    expect(mocks.db.selectDistinctOn).not.toHaveBeenCalled();
  });

  it('scopes the history query to valid diaspora notes for only the visible claim ids via selectDistinctOn', async () => {
    mocks.claimChain.limit.mockResolvedValue([
      {
        id: 'claim-1',
        claimNumber: 'KS-0001',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        memberName: 'Member One',
        memberNumber: 'M-0001',
      },
      { id: 'claim-2' },
    ]);

    await getStaffClaimsList({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
      limit: 20,
      viewerRole: 'branch_manager',
    });

    expect(mocks.db.selectDistinctOn).toHaveBeenCalledWith(
      [mocks.claimStageHistory.claimId],
      expect.objectContaining({
        claimId: mocks.claimStageHistory.claimId,
        note: mocks.claimStageHistory.note,
      })
    );

    const noteEqCalls = mocks.eq.mock.calls.filter(
      call => call[0] === mocks.claimStageHistory.note
    );
    expect(new Set(noteEqCalls.map(call => call[1]))).toEqual(new Set(VALID_DIASPORA_ORIGIN_NOTES));

    expect(mocks.historyChain.orderBy).toHaveBeenCalledWith(
      mocks.claimStageHistory.claimId,
      expect.objectContaining({ op: 'desc', value: mocks.claimStageHistory.createdAt }),
      expect.objectContaining({ op: 'desc', value: mocks.claimStageHistory.id })
    );

    expect(mocks.withTenant).toHaveBeenNthCalledWith(
      2,
      'tenant-ks',
      mocks.claimStageHistory.tenantId,
      expect.objectContaining({
        op: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({
            op: 'inArray',
            column: mocks.claimStageHistory.claimId,
            values: ['claim-1', 'claim-2'],
          }),
        ]),
      })
    );
  });
  it('propagates a failed history read instead of returning an incomplete projection', async () => {
    mocks.claimChain.limit.mockResolvedValue([{ id: 'claim-1' }]);
    mocks.historyChain.orderBy.mockRejectedValueOnce(new Error('history read failed'));

    await expect(
      getStaffClaimsList({ staffId: 'staff-1', tenantId: 'tenant-ks', limit: 20 })
    ).rejects.toThrow('history read failed');
  });
  it('maps assignee details', async () => {
    mocks.claimChain.limit.mockResolvedValue([
      {
        id: 'claim-1',
        claimNumber: 'KS-0001',
        companyName: 'Acme',
        title: 'Claim',
        status: 'verification',
        staffId: 'staff-2',
        assigneeName: 'Drita Gashi',
        assigneeEmail: 'drita@example.com',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        memberName: 'Member One',
        memberNumber: 'M-0001',
      },
    ]);

    const [result] = await getStaffClaimsList({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
      limit: 20,
      viewerRole: 'branch_manager',
    });

    expect(result.assigneeName).toBe('Drita Gashi');
    expect(result.assigneeEmail).toBe('drita@example.com');
    expect(result.isDiasporaOrigin).toBe(false);
  });

  it('maps diaspora origin fields from the latest note', async () => {
    mocks.claimChain.limit.mockResolvedValue([
      {
        id: 'claim-1',
        claimNumber: 'KS-0001',
        companyName: 'Acme',
        title: 'Claim',
        status: 'verification',
        staffId: 'staff-2',
        assigneeName: 'Drita Gashi',
        assigneeEmail: 'drita@example.com',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        memberName: 'Member One',
        memberNumber: 'M-0001',
      },
    ]);
    mocks.historyChain.orderBy.mockResolvedValue([
      {
        claimId: 'claim-1',
        note: 'Started from Diaspora / Green Card quickstart. Country: IT. Incident location: abroad.',
      },
      {
        claimId: 'claim-1',
        note: 'Older note that should not replace the latest diaspora provenance.',
      },
    ]);

    const [result] = await getStaffClaimsList({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
      limit: 20,
      viewerRole: 'branch_manager',
    });

    expect(result.isDiasporaOrigin).toBe(true);
    expect(result.diasporaCountry).toBe('IT');
  });
});
