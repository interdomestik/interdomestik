import { beforeEach, vi } from 'vitest';
import { activity, lead, mocks } from './agent-crm-follow-up.core.test-support';

export function installAgentCrmFollowUpHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createCrmLeadFollowUpRepository.mockReturnValue({
      completeFollowUpActivity: mocks.completeFollowUpActivity,
      createFollowUpActivity: mocks.createFollowUpActivity,
      findById: mocks.findById,
    });
    mocks.findById.mockResolvedValue(lead());
    mocks.createFollowUpActivity.mockImplementation(({ activity: created }) =>
      Promise.resolve(activity({ ...created, agentId: 'agent-1' }))
    );
    mocks.listCrmLeadFollowUpActivitiesForLead.mockResolvedValue([]);
    mocks.listCrmLeadFollowUpTasksForLead.mockResolvedValue([
      activity({
        expectedLifecycleVersion: 1,
        followUpSource: 'crm_task',
        id: 'lead-follow-up-task-1',
        scheduledAt: '2026-05-10T09:00:00.000Z',
      }),
    ]);
    mocks.createCrmTaskCore.mockResolvedValue({
      outcome: 'success',
      task: {
        assignedTo: {
          actorId: 'agent-1',
          branchId: 'branch-1',
          kind: 'actor',
          role: 'agent',
          tenantId: 'tenant-1',
        },
        branchId: 'branch-1',
        completedAt: null,
        createReasonCode: 'follow_up',
        createdAt: '2026-05-10T08:00:00.000Z',
        createdBy: {
          actorId: 'agent-1',
          branchId: 'branch-1',
          role: 'agent',
          tenantId: 'tenant-1',
        },
        dueAt: '2026-05-10T09:00:00.000Z',
        lifecycleVersion: 1,
        status: 'pending',
        subjectReference: { id: 'lead-1', kind: 'lead' },
        taskId: 'lead-follow-up-task-1',
        tenantId: 'tenant-1',
      },
      transition: null,
    });
    mocks.completeCrmTaskCore.mockResolvedValue({
      outcome: 'success',
      task: {
        assignedTo: {
          actorId: 'agent-1',
          branchId: 'branch-1',
          kind: 'actor',
          role: 'agent',
          tenantId: 'tenant-1',
        },
        branchId: 'branch-1',
        completedAt: '2026-05-10T09:30:00.000Z',
        createReasonCode: 'follow_up',
        createdAt: '2026-05-10T08:00:00.000Z',
        createdBy: {
          actorId: 'agent-1',
          branchId: 'branch-1',
          role: 'agent',
          tenantId: 'tenant-1',
        },
        dueAt: '2026-05-10T09:00:00.000Z',
        lifecycleVersion: 2,
        status: 'completed',
        subjectReference: { id: 'lead-1', kind: 'lead' },
        taskId: 'lead-follow-up-task-1',
        tenantId: 'tenant-1',
      },
      transition: null,
    });
    mocks.completeFollowUpActivity.mockResolvedValue(
      activity({ completedAt: '2026-05-10T09:30:00.000Z' })
    );
  });
}
