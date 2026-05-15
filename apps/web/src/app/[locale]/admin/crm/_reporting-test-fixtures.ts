import { vi } from 'vitest';

import type {
  CrmSourceBreakdownRow,
  CrmWeightedPipelineRow,
} from '@interdomestik/domain-crm/reporting';
import type {
  CrmForecastSnapshotRepository,
  CrmReportingRepository,
} from '@interdomestik/domain-crm/reporting/repository';

export function weightedReportingRow(
  overrides: Partial<CrmWeightedPipelineRow> = {}
): CrmWeightedPipelineRow {
  return {
    agentId: 'agent-1',
    branchId: 'branch-1',
    currencyCode: 'EUR',
    currentStageId: 'stage-open',
    dealId: overrides.dealId ?? 'deal-1',
    forecastCategory: 'commit',
    isLostStage: false,
    isWonStage: false,
    pipelineId: 'pipeline-1',
    source: 'website',
    stageProbability: 80,
    tenantId: 'tenant-1',
    valueAmountMinor: 10000,
    ...overrides,
  };
}

export function sourceBreakdownReportingRow(
  overrides: Partial<CrmSourceBreakdownRow> = {}
): CrmSourceBreakdownRow {
  return {
    ...weightedReportingRow(overrides),
    outcome: 'open',
    ...overrides,
  };
}

export function createCrmReportingRepositories() {
  return {
    forecastSnapshotRepository: {
      insertPipelineSnapshots: vi.fn(),
      listLatestPipelineSnapshots: vi.fn(),
    } satisfies CrmForecastSnapshotRepository,
    reportingRepository: {
      listAgentLeaderboardRows: vi.fn(),
      listFunnelConversionRows: vi.fn(),
      listSourceBreakdownRows: vi.fn(),
      listStageVelocityRows: vi.fn(),
      listWeightedPipelineRows: vi.fn(),
      listWinRateRows: vi.fn(),
    } satisfies CrmReportingRepository,
  };
}
