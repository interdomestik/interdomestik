import { describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '../context';
import type { CrmLead, CrmLeadActivity } from './types';
import {
  CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE,
  authorizeCrmLeadFollowUpAction,
  completeCrmLeadFollowUp,
  deriveCrmLeadNextAction,
  isCrmLeadFollowUpDue,
  scheduleCrmLeadFollowUp,
  type CrmLeadFollowUpRepository,
} from './follow-up';

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  tenantId: 'tenant-1',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
};

function lead(overrides: Partial<CrmLead> = {}): CrmLead {
  return {
    agentId: 'agent-1',
    branchId: 'branch-1',
    createdAt: '2026-05-10T08:00:00.000Z',
    id: 'lead-1',
    source: 'referral',
    stage: 'new',
    tenantId: 'tenant-1',
    type: 'individual',
    updatedAt: '2026-05-10T08:00:00.000Z',
    ...overrides,
  };
}

function activity(overrides: Partial<CrmLeadActivity> = {}): CrmLeadActivity {
  return {
    agentId: 'agent-1',
    completedAt: null,
    createdAt: '2026-05-10T08:10:00.000Z',
    description: 'Call the lead.',
    id: 'activity-1',
    leadId: 'lead-1',
    occurredAt: '2026-05-10T08:10:00.000Z',
    scheduledAt: '2026-05-10T09:00:00.000Z',
    subject: 'Follow up',
    tenantId: 'tenant-1',
    type: CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE,
    ...overrides,
  };
}

function repository(
  args: {
    completeResult?: CrmLeadActivity | null;
    lead?: CrmLead | null;
  } = {}
): CrmLeadFollowUpRepository {
  return {
    completeFollowUpActivity: vi.fn().mockResolvedValue(args.completeResult ?? activity()),
    createFollowUpActivity: vi.fn(async ({ activity: created }) => ({
      agentId: 'agent-1',
      completedAt: null,
      createdAt: created.createdAt,
      description: created.description,
      id: created.id,
      leadId: created.leadId,
      occurredAt: created.occurredAt,
      scheduledAt: created.scheduledAt,
      subject: created.subject,
      tenantId: created.tenantId,
      type: created.type,
    })),
    findById: vi.fn().mockResolvedValue(args.lead === undefined ? lead() : args.lead),
  };
}

const services = {
  activityId: () => 'follow-up-1',
  now: () => '2026-05-10T08:30:00.000Z',
};

describe('CRM lead follow-up state helpers', () => {
  it('derives the earliest open follow-up as due or scheduled', () => {
    const currentLead = lead();
    const due = activity({ id: 'due', scheduledAt: '2026-05-10T08:00:00.000Z' });
    const future = activity({ id: 'future', scheduledAt: '2026-05-10T10:00:00.000Z' });

    expect(
      deriveCrmLeadNextAction({
        activities: [future, due],
        lead: currentLead,
        now: '2026-05-10T08:30:00.000Z',
      })
    ).toMatchObject({ activityId: 'due', isOverdue: true, kind: 'follow_up_due' });

    expect(
      deriveCrmLeadNextAction({
        activities: [future],
        lead: currentLead,
        now: '2026-05-10T08:30:00.000Z',
      })
    ).toMatchObject({ activityId: 'future', isOverdue: false, kind: 'follow_up_scheduled' });
  });

  it('uses task-backed follow-ups before legacy activities for the same scheduled time', () => {
    const legacy = activity({
      id: 'legacy',
      scheduledAt: '2026-05-10T08:00:00.000Z',
    });
    const taskBacked = {
      ...activity({
        id: 'task-backed',
        scheduledAt: '2026-05-10T08:00:00.000Z',
        subject: 'Follow up',
      }),
      expectedLifecycleVersion: 2,
      followUpSource: 'crm_task' as const,
    };

    expect(
      deriveCrmLeadNextAction({
        activities: [legacy, taskBacked],
        lead: { id: 'lead-1', tenantId: 'tenant-1' },
        now: '2026-05-10T09:00:00.000Z',
      })
    ).toMatchObject({
      activityId: 'task-backed',
      expectedLifecycleVersion: 2,
      source: 'crm_task',
    });
  });

  it('ignores completed, non-follow-up, cross-lead, cross-tenant, and invalid scheduled activities', () => {
    expect(
      deriveCrmLeadNextAction({
        activities: [
          activity({ completedAt: '2026-05-10T08:15:00.000Z' }),
          activity({ type: 'call' }),
          activity({ leadId: 'lead-2' }),
          activity({ tenantId: 'tenant-2' }),
          activity({ scheduledAt: 'not-a-date' }),
        ],
        lead: lead(),
        now: '2026-05-10T08:30:00.000Z',
      })
    ).toEqual({ kind: 'none' });
  });

  it('checks due state only for open follow-up activities', () => {
    expect(isCrmLeadFollowUpDue(activity(), '2026-05-10T09:00:00.000Z')).toBe(true);
    expect(
      isCrmLeadFollowUpDue(
        activity({ completedAt: '2026-05-10T09:00:00.000Z' }),
        '2026-05-10T09:30:00.000Z'
      )
    ).toBe(false);
    expect(isCrmLeadFollowUpDue(activity({ type: 'note' }), '2026-05-10T09:30:00.000Z')).toBe(
      false
    );
  });
});

describe('CRM lead follow-up authorization', () => {
  it('allows only the assigned agent in the matching tenant and branch scope', () => {
    expect(authorizeCrmLeadFollowUpAction(agentActor, lead())).toEqual({ allowed: true });
    expect(authorizeCrmLeadFollowUpAction(agentActor, lead({ tenantId: 'tenant-2' }))).toEqual({
      allowed: false,
      reason: 'tenant_scope',
    });
    expect(authorizeCrmLeadFollowUpAction(agentActor, lead({ agentId: 'agent-2' }))).toEqual({
      allowed: false,
      reason: 'agent_scope',
    });
    expect(authorizeCrmLeadFollowUpAction(agentActor, lead({ branchId: 'branch-2' }))).toEqual({
      allowed: false,
      reason: 'branch_scope',
    });
    expect(authorizeCrmLeadFollowUpAction(agentActor, lead({ branchId: null }))).toEqual({
      allowed: false,
      reason: 'branch_scope',
    });
    expect(
      authorizeCrmLeadFollowUpAction({ ...agentActor, scope: { agentId: 'agent-1' } }, lead())
    ).toEqual({
      allowed: false,
      reason: 'branch_scope',
    });
    expect(authorizeCrmLeadFollowUpAction({ ...agentActor, role: 'staff' }, lead())).toEqual({
      allowed: false,
      reason: 'role_scope',
    });
  });
});

describe('CRM lead follow-up commands', () => {
  it('schedules a follow-up through the injected repository after authorization', async () => {
    const repo = repository();

    await expect(
      scheduleCrmLeadFollowUp(
        {
          actor: agentActor,
          description: 'Call before noon.',
          leadId: 'lead-1',
          scheduledAt: '2026-05-10T09:00:00.000Z',
          subject: 'Follow up',
        },
        repo,
        services
      )
    ).resolves.toMatchObject({
      activity: {
        id: 'follow-up-1',
        leadId: 'lead-1',
        scheduledAt: '2026-05-10T09:00:00.000Z',
        type: CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE,
      },
      success: true,
    });
    expect(repo.createFollowUpActivity).toHaveBeenCalledWith({
      actor: agentActor,
      activity: expect.objectContaining({
        description: 'Call before noon.',
        tenantId: 'tenant-1',
      }),
    });
  });

  it('does not write when scheduling input is invalid or authorization fails', async () => {
    const invalidInputRepo = repository();
    await expect(
      scheduleCrmLeadFollowUp(
        {
          actor: agentActor,
          leadId: 'lead-1',
          scheduledAt: 'not-a-date',
          subject: 'Follow up',
        },
        invalidInputRepo,
        services
      )
    ).resolves.toEqual({
      success: false,
      error: 'invalid_input',
      reason: 'invalid_scheduled_at',
    });
    expect(invalidInputRepo.findById).not.toHaveBeenCalled();
    expect(invalidInputRepo.createFollowUpActivity).not.toHaveBeenCalled();

    const wrongBranchRepo = repository({ lead: lead({ branchId: 'branch-2' }) });
    await expect(
      scheduleCrmLeadFollowUp(
        {
          actor: agentActor,
          leadId: 'lead-1',
          scheduledAt: '2026-05-10T09:00:00.000Z',
          subject: 'Follow up',
        },
        wrongBranchRepo,
        services
      )
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'branch_scope' });
    expect(wrongBranchRepo.createFollowUpActivity).not.toHaveBeenCalled();

    const missingBranchRepo = repository({ lead: lead({ branchId: null }) });
    await expect(
      scheduleCrmLeadFollowUp(
        {
          actor: agentActor,
          leadId: 'lead-1',
          scheduledAt: '2026-05-10T09:00:00.000Z',
          subject: 'Follow up',
        },
        missingBranchRepo,
        services
      )
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'branch_scope' });
    expect(missingBranchRepo.createFollowUpActivity).not.toHaveBeenCalled();
  });

  it('completes an existing follow-up only after authorization', async () => {
    const repo = repository({
      completeResult: activity({
        completedAt: '2026-05-10T09:30:00.000Z',
      }),
    });

    await expect(
      completeCrmLeadFollowUp(
        {
          activityId: 'activity-1',
          actor: agentActor,
          leadId: 'lead-1',
        },
        repo,
        services
      )
    ).resolves.toMatchObject({
      activity: { completedAt: '2026-05-10T09:30:00.000Z' },
      success: true,
    });
    expect(repo.completeFollowUpActivity).toHaveBeenCalledWith({
      activityId: 'activity-1',
      actor: agentActor,
      completedAt: '2026-05-10T08:30:00.000Z',
      leadId: 'lead-1',
    });
  });

  it('suppresses complete writes for missing, cross-tenant, and cross-agent leads', async () => {
    const missingRepo = repository({ lead: null });
    await expect(
      completeCrmLeadFollowUp(
        { activityId: 'activity-1', actor: agentActor, leadId: 'missing' },
        missingRepo,
        services
      )
    ).resolves.toEqual({ success: false, error: 'not_found' });
    expect(missingRepo.completeFollowUpActivity).not.toHaveBeenCalled();

    const wrongTenantRepo = repository({ lead: lead({ tenantId: 'tenant-2' }) });
    await expect(
      completeCrmLeadFollowUp(
        { activityId: 'activity-1', actor: agentActor, leadId: 'lead-1' },
        wrongTenantRepo,
        services
      )
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'tenant_scope' });
    expect(wrongTenantRepo.completeFollowUpActivity).not.toHaveBeenCalled();

    const wrongAgentRepo = repository({ lead: lead({ agentId: 'agent-2' }) });
    await expect(
      completeCrmLeadFollowUp(
        { activityId: 'activity-1', actor: agentActor, leadId: 'lead-1' },
        wrongAgentRepo,
        services
      )
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'agent_scope' });
    expect(wrongAgentRepo.completeFollowUpActivity).not.toHaveBeenCalled();
  });
});
