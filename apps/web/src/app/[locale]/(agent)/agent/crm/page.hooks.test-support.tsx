import { beforeEach, vi } from 'vitest';
import { hoisted } from './page.test-support';

export function installPageHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionMock.mockResolvedValue(null);
    hoisted.ensureTenantIdMock.mockReturnValue('tenant-1');
    hoisted.getAgentCrmStatsCoreMock.mockResolvedValue({
      newLeadsCount: 0,
      contactedLeadsCount: 0,
      closedWonDealsCount: 0,
      paidCommissionTotal: 0,
      dueFollowUps: [],
    });
    hoisted.getAgentCrmReportingCoreMock.mockResolvedValue({
      sourceBreakdown: {
        excludedMissingCurrencyCount: 0,
        excludedMissingValueCount: 0,
        groups: [],
      },
      weightedPipeline: {
        currencySummaries: [],
        excludedRowCount: 0,
      },
      winRateBySource: {
        groups: [],
      },
      window: {
        from: '2026-02-13T12:00:00.000Z',
        to: '2026-05-14T12:00:00.000Z',
      },
    });
    hoisted.getAgentCrmCompletedTaskQueueCoreMock.mockResolvedValue([]);
    hoisted.getAgentCrmTaskQueueCoreMock.mockResolvedValue([]);
  });
}
