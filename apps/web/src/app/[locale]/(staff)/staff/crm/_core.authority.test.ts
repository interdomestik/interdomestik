import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

const hoisted = vi.hoisted(() => ({
  createCrmReportingRepository: vi.fn(),
  reporting: {
    listFunnelConversionRows: vi.fn(async () => []),
    listStageVelocityRows: vi.fn(async () => []),
    listWeightedPipelineRows: vi.fn(async () => []),
  },
}));

vi.mock('@/adapters/crm/reporting-repository', () => ({
  createCrmReportingRepository: hoisted.createCrmReportingRepository,
}));

import { getStaffCrmReportingCore } from './_core';

const authority = mintTestTenantAuthority('tenant-1');
const actor: CrmActorContext = {
  actorId: 'staff-1',
  role: 'staff',
  scope: { branchId: null, staffId: 'staff-1' },
  tenantId: 'tenant-1',
};

describe('getStaffCrmReportingCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.createCrmReportingRepository.mockReturnValue(hoisted.reporting);
  });

  it('builds its default reporting repository from the session authority', async () => {
    await getStaffCrmReportingCore({ actor, authority }, { logger: console });

    expect(hoisted.createCrmReportingRepository).toHaveBeenCalledTimes(1);
    expect(hoisted.createCrmReportingRepository.mock.calls[0][0]).toBe(authority);
  });
});
