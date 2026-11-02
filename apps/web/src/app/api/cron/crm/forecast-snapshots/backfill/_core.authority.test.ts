import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  createCrmForecastSnapshotRepository: vi.fn(),
  createCrmForecastSnapshotWorkItemRepository: vi.fn(),
  createCrmReportingRepository: vi.fn(),
}));

vi.mock('@/adapters/crm/forecast-snapshot-work-items', () => ({
  createCrmForecastSnapshotWorkItemRepository: hoisted.createCrmForecastSnapshotWorkItemRepository,
}));

vi.mock('@/adapters/crm/reporting-repository', () => ({
  createCrmForecastSnapshotRepository: hoisted.createCrmForecastSnapshotRepository,
  createCrmReportingRepository: hoisted.createCrmReportingRepository,
}));

import { createCrmForecastSnapshotTestDeps } from '../_core.test-helpers';
import { runCrmForecastSnapshotBackfillCore } from './_core';

describe('runCrmForecastSnapshotBackfillCore tenant authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives its tenant from the authority and builds every repository under that authority', async () => {
    const authority = mintTestTenantAuthority('tenant-1');
    const deps = createCrmForecastSnapshotTestDeps();
    hoisted.createCrmForecastSnapshotWorkItemRepository.mockReturnValue(deps.workItemRepository);
    hoisted.createCrmReportingRepository.mockReturnValue(deps.reportingRepository);
    hoisted.createCrmForecastSnapshotRepository.mockReturnValue(deps.snapshotRepository);

    const result = await runCrmForecastSnapshotBackfillCore({
      authority,
      fromDate: '2026-05-14',
      now: new Date('2026-05-15T10:30:00.000Z'),
      toDate: '2026-05-14',
    });

    expect(result.tenantId).toBe('tenant-1');
    const [workItemAuthorities] = hoisted.createCrmForecastSnapshotWorkItemRepository.mock.calls[0];
    expect(workItemAuthorities).toHaveLength(1);
    expect(workItemAuthorities[0]).toBe(authority);
    expect(hoisted.createCrmReportingRepository.mock.calls[0][0]).toBe(authority);
    expect(hoisted.createCrmForecastSnapshotRepository.mock.calls[0][0]).toBe(authority);
    expect(deps.workItemRepository.listWorkItems).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' })
    );
  });
});
