import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import {
  createCrmReportingRepositories,
  sourceBreakdownReportingRow,
  weightedReportingRow,
} from './_reporting-test-fixtures';

export const TEST_AUTHORITY = mintTestTenantAuthority('tenant-1');

export const actor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: {},
  tenantId: 'tenant-1',
};

export function createRepositories() {
  const { forecastSnapshotRepository, reportingRepository } = createCrmReportingRepositories();
  const forecastSnapshotObservabilityRepository = {
    listObservedSnapshots: vi.fn(),
  };
  const forecastSnapshotWorkItemRepository = {
    listWorkItems: vi.fn(),
  };

  reportingRepository.listWeightedPipelineRows.mockResolvedValue([weightedReportingRow()]);
  reportingRepository.listSourceBreakdownRows.mockResolvedValue([sourceBreakdownReportingRow()]);
  forecastSnapshotRepository.listLatestPipelineSnapshots.mockResolvedValue([
    {
      branchId: null,
      closedLostAmountMinor: 1000,
      closedWonAmountMinor: 2000,
      createdAt: '2026-05-14T05:20:00.000Z',
      currencyCode: 'EUR',
      forecastBestAmountMinor: 0,
      forecastCommitAmountMinor: 8000,
      forecastOmittedAmountMinor: 0,
      forecastPipelineAmountMinor: 0,
      id: 'snapshot-1',
      openDealCount: 1,
      pipelineId: 'pipeline-1',
      rawValueAmountMinor: 10000,
      snapshotDate: '2026-05-13',
      snapshotVersion: 2,
      tenantId: 'tenant-1',
      weightedValueAmountMinor: 8000,
    },
  ]);
  forecastSnapshotWorkItemRepository.listWorkItems.mockResolvedValue({
    workItems: [
      {
        branchId: null,
        currencyCode: 'EUR',
        pipelineId: 'pipeline-1',
        tenantId: 'tenant-1',
      },
    ],
    workItemsDeferred: 0,
  });
  forecastSnapshotObservabilityRepository.listObservedSnapshots.mockResolvedValue([
    {
      branchId: null,
      createdAt: '2026-05-14T05:20:00.000Z',
      currencyCode: 'EUR',
      pipelineId: 'pipeline-1',
      snapshotDate: '2026-05-13',
      snapshotVersion: 2,
      sourceRunId: 'run-1',
      tenantId: 'tenant-1',
    },
  ]);

  return {
    forecastSnapshotObservabilityRepository,
    forecastSnapshotRepository,
    forecastSnapshotWorkItemRepository,
    reportingRepository,
  };
}
