import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

const hoisted = vi.hoisted(() => {
  const emptyReporting = {
    listSourceBreakdownRows: vi.fn(async () => []),
    listWeightedPipelineRows: vi.fn(async () => []),
  };
  const emptySnapshots = { listLatestPipelineSnapshots: vi.fn(async () => []) };
  return {
    createAdminCrmRoutingRuleRepository: vi.fn(),
    createCrmForecastSnapshotObservabilityRepository: vi.fn(),
    createCrmForecastSnapshotRepository: vi.fn(),
    createCrmForecastSnapshotWorkItemRepository: vi.fn(),
    createCrmReportingRepository: vi.fn(),
    emptyReporting,
    emptySnapshots,
    routingRepository: {
      listBranches: vi.fn(async () => []),
      listRoutingRulesForAdmin: vi.fn(async () => []),
    },
    workItems: { listWorkItems: vi.fn(async () => ({ workItems: [], workItemsDeferred: 0 })) },
    observability: { listObservedSnapshots: vi.fn(async () => []) },
  };
});

vi.mock('@/adapters/crm/reporting-repository', () => ({
  createCrmForecastSnapshotRepository: hoisted.createCrmForecastSnapshotRepository,
  createCrmReportingRepository: hoisted.createCrmReportingRepository,
}));
vi.mock('@/adapters/crm/forecast-snapshot-observability', () => ({
  createCrmForecastSnapshotObservabilityRepository:
    hoisted.createCrmForecastSnapshotObservabilityRepository,
}));
vi.mock('@/adapters/crm/forecast-snapshot-work-items', () => ({
  CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN: 1000,
  createCrmForecastSnapshotWorkItemRepository: hoisted.createCrmForecastSnapshotWorkItemRepository,
}));
vi.mock('@/adapters/crm/routing-repository', () => ({
  createAdminCrmRoutingRuleRepository: hoisted.createAdminCrmRoutingRuleRepository,
}));

import { getBranchManagerCrmReportingCore } from './_branch-manager-core';
import { getAdminCrmReportingCore } from './_core';
import { getAdminCrmRoutingRulesCore } from './_routing-core';

const authority = mintTestTenantAuthority('tenant-1');
const adminActor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: {},
  tenantId: 'tenant-1',
};
const managerActor: CrmActorContext = {
  actorId: 'manager-1',
  role: 'branch_manager',
  scope: { branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

describe('admin CRM cores build their default repositories from the session authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.createCrmReportingRepository.mockReturnValue(hoisted.emptyReporting);
    hoisted.createCrmForecastSnapshotRepository.mockReturnValue(hoisted.emptySnapshots);
    hoisted.createCrmForecastSnapshotWorkItemRepository.mockReturnValue(hoisted.workItems);
    hoisted.createCrmForecastSnapshotObservabilityRepository.mockReturnValue(hoisted.observability);
    hoisted.createAdminCrmRoutingRuleRepository.mockReturnValue(hoisted.routingRepository);
  });

  it('admin reporting', async () => {
    await getAdminCrmReportingCore({ actor: adminActor, authority }, { logger: console });

    expect(hoisted.createCrmReportingRepository.mock.calls[0][0]).toBe(authority);
    expect(hoisted.createCrmForecastSnapshotRepository.mock.calls[0][0]).toBe(authority);
    expect(hoisted.createCrmForecastSnapshotObservabilityRepository.mock.calls[0][0]).toBe(
      authority
    );
    const [workItemAuthorities] = hoisted.createCrmForecastSnapshotWorkItemRepository.mock.calls[0];
    expect(workItemAuthorities).toHaveLength(1);
    expect(workItemAuthorities[0]).toBe(authority);
  });

  it('branch-manager reporting', async () => {
    await getBranchManagerCrmReportingCore({ actor: managerActor, authority });

    expect(hoisted.createCrmReportingRepository.mock.calls[0][0]).toBe(authority);
    expect(hoisted.createCrmForecastSnapshotRepository.mock.calls[0][0]).toBe(authority);
  });

  it('routing rules', async () => {
    await getAdminCrmRoutingRulesCore({ actor: adminActor, authority });

    expect(hoisted.createAdminCrmRoutingRuleRepository.mock.calls[0][0]).toBe(authority);
  });
});
