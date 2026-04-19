import { agentClients, claims, serviceUsage, subscriptions } from '@interdomestik/database/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGroupDashboardSummaryCore } from './get-group-dashboard-summary';

function sortStrings(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

describe('getGroupDashboardSummaryCore', () => {
  const mockDb = {
    groupBy: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };

  const services = { db: mockDb as any };

  beforeEach(() => {
    mockDb.groupBy.mockClear();
    mockDb.select.mockClear();
    mockDb.from.mockClear();
    mockDb.where.mockReset();
  });

  it('aggregates activation, usage, and SLA-safe case metrics for an office portfolio', async () => {
    mockDb.where
      .mockImplementationOnce(async () => [
        { memberId: 'member-1' },
        { memberId: 'member-2' },
        { memberId: 'member-3' },
      ])
      .mockImplementationOnce(async () => [
        { id: 'sub-1', userId: 'member-1' },
        { id: 'sub-2', userId: 'member-2' },
        { id: 'sub-3', userId: 'member-3' },
      ])
      .mockImplementationOnce(async () => [
        { subscriptionId: 'sub-1' },
        { subscriptionId: 'sub-1' },
        { subscriptionId: 'sub-3' },
      ])
      .mockImplementationOnce(() => mockDb)
      .mockImplementationOnce(async () => [{ count: '2' }]);
    mockDb.groupBy.mockResolvedValueOnce([
      { count: '1', status: 'submitted' },
      { count: '1', status: 'verification' },
      { count: '1', status: 'evaluation' },
      { count: '1', status: 'draft' },
    ]);

    const summary = await getGroupDashboardSummaryCore(
      { agentId: 'agent-1', tenantId: 'tenant-1' },
      services
    );

    expect(summary).toEqual({
      activatedMembersCount: 3,
      membersUsingBenefitsCount: 2,
      usageRatePercent: 67,
      openClaimsCount: 4,
      sla: {
        breachCount: 2,
        incompleteCount: 1,
        notApplicableCount: 1,
        runningCount: 2,
      },
    });
    expect(sortStrings(Object.keys(summary))).toEqual([
      'activatedMembersCount',
      'membersUsingBenefitsCount',
      'openClaimsCount',
      'sla',
      'usageRatePercent',
    ]);
    expect(sortStrings(Object.keys(summary.sla))).toEqual([
      'breachCount',
      'incompleteCount',
      'notApplicableCount',
      'runningCount',
    ]);
    expect(summary).not.toHaveProperty('claims');
    expect(summary).not.toHaveProperty('documents');
    expect(summary).not.toHaveProperty('memberIds');
    expect(summary).not.toHaveProperty('notes');

    expect(mockDb.from).toHaveBeenCalledWith(agentClients);
    expect(mockDb.from).toHaveBeenCalledWith(subscriptions);
    expect(mockDb.from).toHaveBeenCalledWith(serviceUsage);
    expect(mockDb.from).toHaveBeenCalledWith(claims);
    expect(mockDb.groupBy).toHaveBeenCalledWith(claims.status);
  });

  it('returns zero aggregates when the agent has no active member assignments', async () => {
    mockDb.where.mockResolvedValueOnce([]);

    const summary = await getGroupDashboardSummaryCore(
      { agentId: 'agent-1', tenantId: 'tenant-1' },
      services
    );

    expect(summary).toEqual({
      activatedMembersCount: 0,
      membersUsingBenefitsCount: 0,
      usageRatePercent: 0,
      openClaimsCount: 0,
      sla: {
        breachCount: 0,
        incompleteCount: 0,
        notApplicableCount: 0,
        runningCount: 0,
      },
    });
    expect(sortStrings(Object.keys(summary))).toEqual([
      'activatedMembersCount',
      'membersUsingBenefitsCount',
      'openClaimsCount',
      'sla',
      'usageRatePercent',
    ]);
    expect(mockDb.where).toHaveBeenCalledTimes(1);
  });

  it('uses active member assignments even when subscription ownership is stale', async () => {
    mockDb.where
      .mockImplementationOnce(async () => [{ memberId: 'member-1' }, { memberId: 'member-2' }])
      .mockImplementationOnce(async () => [
        { id: 'sub-1', userId: 'member-1' },
        { id: 'sub-2', userId: 'member-2' },
      ])
      .mockImplementationOnce(async () => [{ subscriptionId: 'sub-2' }])
      .mockImplementationOnce(() => mockDb)
      .mockImplementationOnce(async () => [{ count: '1' }]);
    mockDb.groupBy.mockResolvedValueOnce([{ count: '2', status: 'submitted' }]);

    const summary = await getGroupDashboardSummaryCore(
      { agentId: 'agent-1', tenantId: 'tenant-1' },
      services
    );

    expect(summary).toEqual({
      activatedMembersCount: 2,
      membersUsingBenefitsCount: 1,
      usageRatePercent: 50,
      openClaimsCount: 2,
      sla: {
        breachCount: 1,
        incompleteCount: 0,
        notApplicableCount: 0,
        runningCount: 2,
      },
    });
  });
});
