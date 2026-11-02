import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type {
  CrmSourceBreakdownRow,
  CrmWeightedPipelineRow,
  CrmWinRateRow,
} from '@interdomestik/domain-crm/reporting';

const hoisted = vi.hoisted(() => ({
  getAgentCrmDashboard: vi.fn(),
  crmDashboardRepository: { readAgentDashboard: vi.fn() },
  createCrmDashboardRepository: vi.fn(),
  createCrmReportingRepository: vi.fn(),
  crmReportingRepository: {
    listSourceBreakdownRows: vi.fn(),
    listWeightedPipelineRows: vi.fn(),
    listWinRateRows: vi.fn(),
  },
  createAgentCrmTaskWorkQueueRepository: vi.fn(),
  agentCrmTaskWorkQueueRepository: {
    readAgentCompletedTaskQueue: vi.fn(),
    readAgentTaskWorkQueue: vi.fn(),
  },
}));

vi.mock('@interdomestik/domain-crm/dashboards', () => ({
  getAgentCrmDashboard: hoisted.getAgentCrmDashboard,
}));

vi.mock('@/adapters/crm/dashboard-repository', () => ({
  createCrmDashboardRepository: hoisted.createCrmDashboardRepository,
}));

vi.mock('@/adapters/crm/reporting-repository', () => ({
  createCrmReportingRepository: hoisted.createCrmReportingRepository,
}));

vi.mock('@/adapters/crm/task-work-queue-repository', () => ({
  createAgentCrmTaskWorkQueueRepository: hoisted.createAgentCrmTaskWorkQueueRepository,
}));

export const authority = mintTestTenantAuthority('tenant-1');
export const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

export const weightedRow: CrmWeightedPipelineRow = {
  agentId: 'agent-1',
  branchId: 'branch-1',
  currencyCode: 'EUR',
  currentStageId: 'stage-commit',
  dealId: 'deal-1',
  forecastCategory: 'commit',
  isLostStage: false,
  isWonStage: false,
  pipelineId: 'pipeline-1',
  source: 'website',
  stageProbability: 80,
  tenantId: 'tenant-1',
  valueAmountMinor: 10000,
};

export const sourceRow: CrmSourceBreakdownRow = {
  ...weightedRow,
  outcome: 'won',
};

export const winRateRow: CrmWinRateRow = {
  agentId: 'agent-1',
  branchId: 'branch-1',
  outcome: 'won',
  pipelineId: 'pipeline-1',
  source: 'website',
  stageId: 'stage-won',
  tenantId: 'tenant-1',
};

export { hoisted };
