import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type {
  CrmFunnelConversionRow,
  CrmStageVelocityRow,
  CrmWeightedPipelineRow,
} from '@interdomestik/domain-crm/reporting';
import type { CrmReportingRepository } from '@interdomestik/domain-crm/reporting/repository';

export const TEST_AUTHORITY = mintTestTenantAuthority('tenant-1');

export const actor: CrmActorContext = {
  actorId: 'staff-1',
  role: 'staff',
  scope: { branchId: null, staffId: 'staff-1' },
  tenantId: 'tenant-1',
};

export function weightedRow(
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

export function funnelRow(overrides: Partial<CrmFunnelConversionRow> = {}): CrmFunnelConversionRow {
  return {
    branchId: 'branch-1',
    dealId: overrides.dealId ?? 'deal-1',
    enteredAt: '2026-05-01T00:00:00.000Z',
    exitedAt: '2026-05-02T00:00:00.000Z',
    kind: 'stage_changed',
    lossReasonId: null,
    pipelineId: 'pipeline-1',
    stageId: 'stage-qualified',
    stageIsLost: false,
    stageIsWon: false,
    tenantId: 'tenant-1',
    ...overrides,
  };
}

export function velocityRow(overrides: Partial<CrmStageVelocityRow> = {}): CrmStageVelocityRow {
  return {
    branchId: 'branch-1',
    dealId: overrides.dealId ?? 'deal-1',
    enteredAt: '2026-05-01T00:00:00.000Z',
    exitedAt: '2026-05-04T00:00:00.000Z',
    kind: 'stage_changed',
    pipelineId: 'pipeline-1',
    stageId: 'stage-qualified',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

export function createRepository() {
  const repository = {
    listAgentLeaderboardRows: vi.fn(),
    listFunnelConversionRows: vi.fn(),
    listSourceBreakdownRows: vi.fn(),
    listStageVelocityRows: vi.fn(),
    listWeightedPipelineRows: vi.fn(),
    listWinRateRows: vi.fn(),
  } satisfies CrmReportingRepository;

  repository.listWeightedPipelineRows.mockResolvedValue([weightedRow()]);
  repository.listFunnelConversionRows.mockResolvedValue([funnelRow()]);
  repository.listStageVelocityRows.mockResolvedValue([
    velocityRow({ dealId: 'velocity-1', exitedAt: '2026-05-03T00:00:00.000Z' }),
    velocityRow({ dealId: 'velocity-2', exitedAt: '2026-05-04T00:00:00.000Z' }),
    velocityRow({ dealId: 'velocity-3', exitedAt: '2026-05-05T00:00:00.000Z' }),
  ]);

  return repository;
}
