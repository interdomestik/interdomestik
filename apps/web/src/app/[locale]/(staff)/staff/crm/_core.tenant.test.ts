import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';

const state = vi.hoisted(() => ({ createReaders: vi.fn() }));
vi.mock('@/app/[locale]/admin/crm/_reporting-tenant', () => ({
  createAdminCrmReportingTenantRepositories: state.createReaders,
}));

import { getStaffCrmReportingCore } from './_core';

const actor: CrmActorContext = {
  actorId: 'staff-1',
  role: 'staff',
  scope: { branchId: null, staffId: 'staff-1' },
  tenantId: 'tenant-1',
};
const now = () => '2026-05-14T12:00:00.000Z';

function repository() {
  return {
    listAgentLeaderboardRows: vi.fn().mockResolvedValue([]),
    listFunnelConversionRows: vi.fn().mockResolvedValue([]),
    listSourceBreakdownRows: vi.fn().mockResolvedValue([]),
    listStageVelocityRows: vi.fn().mockResolvedValue([]),
    listWeightedPipelineRows: vi.fn().mockResolvedValue([]),
    listWinRateRows: vi.fn().mockResolvedValue([]),
  };
}

describe('staff CRM default tenant readers', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates readers only after staff and tenant authorization', async () => {
    for (const denied of [
      { ...actor, tenantId: '' },
      { ...actor, role: 'member' as const },
    ]) {
      await expect(getStaffCrmReportingCore({ actor: denied }, { now })).rejects.toMatchObject({
        name: 'StaffCrmReportingAccessDeniedError',
      });
    }
    expect(state.createReaders).not.toHaveBeenCalled();
  });

  it('binds default reads separately to each request tenant', async () => {
    for (const tenantId of ['tenant-1', 'tenant-2']) {
      const reads = repository();
      state.createReaders.mockReturnValueOnce({ reportingRepository: reads });
      await getStaffCrmReportingCore({ actor: { ...actor, tenantId } }, { now });
      expect(state.createReaders).toHaveBeenLastCalledWith(tenantId);
      expect(reads.listWeightedPipelineRows).toHaveBeenCalledOnce();
      expect(reads.listFunnelConversionRows).toHaveBeenCalledOnce();
      expect(reads.listStageVelocityRows).toHaveBeenCalledOnce();
    }
  });

  it('keeps other widgets healthy when one default read fails', async () => {
    const reads = repository();
    reads.listFunnelConversionRows.mockRejectedValueOnce(new Error('owned read failure'));
    state.createReaders.mockReturnValueOnce({ reportingRepository: reads });
    const dashboard = await getStaffCrmReportingCore(
      { actor },
      { now, logger: { error: vi.fn() } }
    );
    expect(dashboard.funnelMovement.state).toBe('error');
    expect(dashboard.pipelineWorkload.state).toBe('empty');
    expect(dashboard.stageVelocity.state).toBe('empty');
    expect(reads.listWeightedPipelineRows).toHaveBeenCalledOnce();
    expect(reads.listStageVelocityRows).toHaveBeenCalledOnce();
  });
});
