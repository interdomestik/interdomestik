import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  createCrmForecastSnapshotRepository: vi.fn(),
  createCrmForecastSnapshotWorkItemRepository: vi.fn(),
  createCrmReportingRepository: vi.fn(),
  listScheduledTenantWork: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  listScheduledTenantWork: hoisted.listScheduledTenantWork,
}));

vi.mock('@/adapters/crm/forecast-snapshot-work-items', () => ({
  CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN: 1000,
  createCrmForecastSnapshotWorkItemRepository: hoisted.createCrmForecastSnapshotWorkItemRepository,
}));

vi.mock('@/adapters/crm/reporting-repository', () => ({
  createCrmForecastSnapshotRepository: hoisted.createCrmForecastSnapshotRepository,
  createCrmReportingRepository: hoisted.createCrmReportingRepository,
}));

import { runCrmForecastSnapshotSchedulerCore } from './_core';
import {
  createCrmForecastSnapshotTestDeps,
  crmForecastSnapshotTestAuthority,
  crmForecastSnapshotTestIngress,
} from './_core.test-helpers';

const now = new Date('2026-05-14T05:15:00.000Z');

describe('runCrmForecastSnapshotSchedulerCore tenant authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds every repository from the scheduled-work authority of the tenant it serves', async () => {
    const authority1 = crmForecastSnapshotTestAuthority('tenant-1');
    const authority2 = crmForecastSnapshotTestAuthority('tenant-2');
    hoisted.listScheduledTenantWork.mockResolvedValue([
      { authority: authority1, tenantId: 'tenant-1' },
      { authority: authority2, tenantId: 'tenant-2' },
    ]);
    const deps = createCrmForecastSnapshotTestDeps({
      workItems: [
        {
          branchId: 'branch-1',
          currencyCode: 'EUR',
          pipelineId: 'pipeline-1',
          tenantId: 'tenant-1',
        },
        {
          branchId: 'branch-2',
          currencyCode: 'EUR',
          pipelineId: 'pipeline-2',
          tenantId: 'tenant-2',
        },
      ],
    });
    hoisted.createCrmForecastSnapshotWorkItemRepository.mockReturnValue(deps.workItemRepository);
    hoisted.createCrmReportingRepository.mockReturnValue(deps.reportingRepository);
    hoisted.createCrmForecastSnapshotRepository.mockReturnValue(deps.snapshotRepository);

    await runCrmForecastSnapshotSchedulerCore({
      ingress: crmForecastSnapshotTestIngress,
      now,
    });

    // The work-item repository is scoped to exactly the admitted authorities, in listed order.
    const [listed] = hoisted.createCrmForecastSnapshotWorkItemRepository.mock.calls[0];
    expect(listed).toHaveLength(2);
    expect(listed[0]).toBe(authority1);
    expect(listed[1]).toBe(authority2);

    // One reporting and one snapshot repository per tenant, each bound to that tenant's authority.
    const reportingAuthorities = hoisted.createCrmReportingRepository.mock.calls.map(
      call => call[0]
    );
    const snapshotAuthorities = hoisted.createCrmForecastSnapshotRepository.mock.calls.map(
      call => call[0]
    );
    expect(reportingAuthorities).toHaveLength(2);
    expect(reportingAuthorities[0]).toBe(authority1);
    expect(reportingAuthorities[1]).toBe(authority2);
    expect(snapshotAuthorities).toHaveLength(2);
    expect(snapshotAuthorities[0]).toBe(authority1);
    expect(snapshotAuthorities[1]).toBe(authority2);
  });
});
