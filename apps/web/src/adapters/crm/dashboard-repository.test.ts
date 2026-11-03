import {
  hoisted,
  repository,
  actor,
  createSelectChain,
  createGroupByChain,
  createJoinSelectChain,
  createDueFollowUpsChain,
} from './dashboard-repository.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('createCrmDashboardRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns aggregate rows for the domain dashboard mapper', async () => {
    hoisted.dbSelect
      .mockReturnValueOnce(
        createGroupByChain([
          { stage: 'new', count: '3' },
          { stage: 'contacted', count: '7' },
        ])
      )
      .mockReturnValueOnce(createJoinSelectChain([{ count: '2' }]))
      .mockReturnValueOnce(createSelectChain([{ total: '123.45' }]))
      .mockReturnValueOnce(
        createDueFollowUpsChain([
          {
            activityId: 'activity-1',
            agentId: 'agent-1',
            branchId: 'branch-1',
            completedAt: null,
            companyName: null,
            createdAt: new Date('2026-05-10T08:00:00.000Z'),
            fullName: 'Lead One',
            leadId: 'lead-1',
            scheduledAt: new Date('2026-05-10T10:00:00.000Z'),
            subject: 'Call back',
            tenantId: 'tenant-1',
            type: 'follow_up',
          },
        ])
      )
      .mockReturnValueOnce(
        createDueFollowUpsChain([
          {
            activityId: 'task-1',
            agentId: 'agent-1',
            branchId: 'branch-1',
            companyName: 'Task Co',
            createdAt: new Date('2026-05-10T08:00:00.000Z'),
            expectedLifecycleVersion: 1,
            fullName: null,
            leadId: 'lead-2',
            scheduledAt: new Date('2026-05-10T11:00:00.000Z'),
            tenantId: 'tenant-1',
          },
        ])
      );

    const readModel = await repository.readAgentDashboard({
      actor,
      limit: 5,
      now: '2026-05-12T08:00:00.000Z',
    });

    expect(readModel).toEqual({
      closedWonDealsCount: '2',
      dueFollowUps: [
        {
          activityId: 'activity-1',
          agentId: 'agent-1',
          branchId: 'branch-1',
          completedAt: null,
          companyName: null,
          createdAt: new Date('2026-05-10T08:00:00.000Z'),
          expectedLifecycleVersion: null,
          fullName: 'Lead One',
          leadId: 'lead-1',
          scheduledAt: new Date('2026-05-10T10:00:00.000Z'),
          source: 'legacy_activity',
          subject: 'Call back',
          tenantId: 'tenant-1',
          type: 'follow_up',
        },
        {
          activityId: 'task-1',
          agentId: 'agent-1',
          branchId: 'branch-1',
          companyName: 'Task Co',
          completedAt: null,
          createdAt: new Date('2026-05-10T08:00:00.000Z'),
          expectedLifecycleVersion: 1,
          fullName: null,
          leadId: 'lead-2',
          scheduledAt: new Date('2026-05-10T11:00:00.000Z'),
          source: 'crm_task',
          subject: 'Follow up',
          tenantId: 'tenant-1',
          type: 'follow_up',
        },
      ],
      leadCounts: [
        { stage: 'new', count: '3' },
        { stage: 'contacted', count: '7' },
      ],
      paidCommissionTotal: '123.45',
    });
  });

  it('fails closed before querying when branch scope is missing', async () => {
    await expect(
      repository.readAgentDashboard({
        actor: { ...actor, scope: { agentId: 'agent-1', branchId: null } },
        limit: 5,
        now: '2026-05-12T08:00:00.000Z',
      })
    ).rejects.toThrow('CRM dashboard read requires actor branch scope');

    expect(hoisted.dbSelect).not.toHaveBeenCalled();
  });
});
