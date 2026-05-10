import { describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '../context';
import type { CrmLeadRepository } from '../leads/repository';
import type { CrmLead, CrmLeadActivity } from '../leads/types';
import type { SupportHandoffRepository } from '../support-handoffs/repository';
import type { SupportHandoff } from '../support-handoffs/types';
import { authorizeCrmLeadTimelineRead, authorizeSupportHandoffTimelineRead } from './authorization';
import { listLeadTimeline, listSupportHandoffTimeline } from './read-model';

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  tenantId: 'tenant-1',
  scope: { agentId: 'agent-1' },
};

const memberActor: CrmActorContext = {
  actorId: 'member-1',
  role: 'member',
  tenantId: 'tenant-1',
  scope: { memberId: 'member-1' },
};

const staffActor: CrmActorContext = {
  actorId: 'staff-1',
  role: 'staff',
  tenantId: 'tenant-1',
  scope: { branchId: 'branch-1', staffId: 'staff-1' },
};

const branchManagerWithoutBranch: CrmActorContext = {
  actorId: 'manager-1',
  role: 'branch_manager',
  tenantId: 'tenant-1',
  scope: {},
};

function lead(overrides: Partial<CrmLead> = {}): CrmLead {
  return {
    agentId: 'agent-1',
    branchId: 'branch-1',
    createdAt: '2026-05-10T08:00:00.000Z',
    id: 'lead-1',
    source: 'member_referral',
    stage: 'new',
    tenantId: 'tenant-1',
    type: 'individual',
    updatedAt: '2026-05-10T08:10:00.000Z',
    ...overrides,
  };
}

function activity(overrides: Partial<CrmLeadActivity> = {}): CrmLeadActivity {
  return {
    agentId: 'agent-1',
    createdAt: '2026-05-10T08:30:00.000Z',
    description: 'Left a voicemail.',
    id: 'activity-1',
    leadId: 'lead-1',
    occurredAt: '2026-05-10T08:20:00.000Z',
    subject: 'First call',
    tenantId: 'tenant-1',
    type: 'call',
    ...overrides,
  };
}

function handoff(overrides: Partial<SupportHandoff> = {}): SupportHandoff {
  return {
    branchId: 'branch-1',
    claimId: 'claim-1',
    createdAt: '2026-05-10T09:00:00.000Z',
    cycle: {
      memberReplyAt: '2026-05-10T09:20:00.000Z',
      memberReplyResponseVersion: 1,
      publicResponseAcknowledgedAt: '2026-05-10T09:15:00.000Z',
      publicResponseAcknowledgedById: 'member-1',
      publicResponseAcknowledgedVersion: 1,
      publicResponseAt: '2026-05-10T09:10:00.000Z',
      publicResponseById: 'staff-1',
      publicResponseVersion: 1,
      staffFollowedUpAt: null,
      staffFollowedUpById: null,
    },
    id: 'handoff-1',
    lifecycleVersion: 1,
    memberId: 'member-1',
    staffId: 'staff-1',
    state: 'member_replied',
    status: 'accepted',
    tenantId: 'tenant-1',
    updatedAt: '2026-05-10T09:20:00.000Z',
    ...overrides,
  };
}

function leadRepository(args: {
  activities?: CrmLeadActivity[];
  lead?: CrmLead | null;
}): Pick<CrmLeadRepository, 'findById' | 'listActivitiesForLead'> {
  return {
    findById: vi.fn().mockResolvedValue(args.lead === undefined ? lead() : args.lead),
    listActivitiesForLead: vi.fn().mockResolvedValue(args.activities ?? [activity()]),
  };
}

function handoffRepository(
  value: SupportHandoff | null
): Pick<SupportHandoffRepository, 'findById'> {
  return {
    findById: vi.fn().mockResolvedValue(value),
  };
}

describe('CRM timeline read model', () => {
  it('derives a lead timeline from lead aggregate and legacy activity read source', async () => {
    const leads = leadRepository({
      activities: [
        activity({ id: 'activity-2', occurredAt: '2026-05-10T08:40:00.000Z', type: 'email' }),
        activity({ id: 'activity-1', occurredAt: '2026-05-10T08:20:00.000Z', type: 'call' }),
      ],
    });

    const result = await listLeadTimeline(
      { actor: agentActor, leadId: 'lead-1', limit: 25 },
      { leads }
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected lead timeline success');
    expect(result.items.map(item => item.kind)).toEqual([
      'lead_created',
      'lead_activity_logged',
      'lead_activity_logged',
    ]);
    expect(result.items.map(item => item.occurredAt)).toEqual([
      '2026-05-10T08:00:00.000Z',
      '2026-05-10T08:20:00.000Z',
      '2026-05-10T08:40:00.000Z',
    ]);
    expect(leads.findById).toHaveBeenCalledWith({ actor: agentActor, leadId: 'lead-1' });
    expect(leads.listActivitiesForLead).toHaveBeenCalledWith({
      actor: agentActor,
      leadId: 'lead-1',
      limit: 25,
    });
  });

  it('denies lead timelines when a repository leaks the wrong tenant or actor scope', async () => {
    const wrongTenant = leadRepository({ lead: lead({ tenantId: 'tenant-2' }) });
    await expect(
      listLeadTimeline({ actor: agentActor, leadId: 'lead-1' }, { leads: wrongTenant })
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'tenant_scope' });
    expect(wrongTenant.listActivitiesForLead).not.toHaveBeenCalled();

    const wrongAgent = leadRepository({ lead: lead({ agentId: 'agent-2' }) });
    await expect(
      listLeadTimeline({ actor: agentActor, leadId: 'lead-1' }, { leads: wrongAgent })
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'actor_scope' });
    expect(wrongAgent.listActivitiesForLead).not.toHaveBeenCalled();
  });

  it('returns not found without reading lead activities', async () => {
    const leads = leadRepository({ lead: null });

    await expect(
      listLeadTimeline({ actor: agentActor, leadId: 'missing-lead' }, { leads })
    ).resolves.toEqual({ success: false, error: 'not_found' });
    expect(leads.listActivitiesForLead).not.toHaveBeenCalled();
  });

  it('derives support handoff response, acknowledgement, and member-reply timeline items', async () => {
    const supportHandoffs = handoffRepository(handoff());
    const result = await listSupportHandoffTimeline(
      { actor: memberActor, handoffId: 'handoff-1' },
      { supportHandoffs }
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected support handoff timeline success');
    expect(result.items.map(item => item.kind)).toEqual([
      'support_handoff_created',
      'support_handoff_staff_response',
      'support_handoff_member_acknowledgement',
      'support_handoff_member_reply',
    ]);
    expect(result.items[1]).toMatchObject({
      actorId: 'staff-1',
      metadata: { responseVersion: 1 },
    });
    expect(result.items[3]).toMatchObject({
      actorId: 'member-1',
      metadata: { responseVersion: 1 },
    });
  });

  it('derives terminal staff follow-up from the latest response after a member reply', async () => {
    const supportHandoffs = handoffRepository(
      handoff({
        cycle: {
          ...handoff().cycle,
          memberReplyAt: '2026-05-10T09:20:00.000Z',
          memberReplyResponseVersion: 1,
          publicResponseAt: '2026-05-10T09:30:00.000Z',
          publicResponseVersion: 2,
          staffFollowedUpAt: '2026-05-10T09:30:00.000Z',
          staffFollowedUpById: 'staff-1',
        },
        state: 'staff_followed_up',
      })
    );

    const result = await listSupportHandoffTimeline(
      { actor: staffActor, handoffId: 'handoff-1' },
      { supportHandoffs }
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected support handoff timeline success');
    expect(result.items.map(item => item.kind)).toContain('support_handoff_staff_follow_up');
    expect(result.items.map(item => item.kind)).toContain('support_handoff_member_reply');
    expect(result.items.map(item => item.kind)).not.toContain('support_handoff_staff_response');
  });

  it('omits versioned support handoff events when their response version is not recorded', async () => {
    const supportHandoffs = handoffRepository(
      handoff({
        cycle: {
          ...handoff().cycle,
          memberReplyResponseVersion: 3,
          publicResponseAcknowledgedVersion: null,
          publicResponseVersion: 2,
        },
      })
    );

    const result = await listSupportHandoffTimeline(
      { actor: memberActor, handoffId: 'handoff-1' },
      { supportHandoffs }
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected support handoff timeline success');
    expect(result.items.map(item => item.kind)).toEqual([
      'support_handoff_created',
      'support_handoff_staff_response',
    ]);
  });

  it('denies support handoff timelines outside member, staff, branch, or tenant scope', async () => {
    const wrongMember = handoffRepository(handoff({ memberId: 'member-2' }));
    await expect(
      listSupportHandoffTimeline(
        { actor: memberActor, handoffId: 'handoff-1' },
        { supportHandoffs: wrongMember }
      )
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'actor_scope' });

    const wrongStaff = handoffRepository(handoff({ staffId: 'staff-2' }));
    await expect(
      listSupportHandoffTimeline(
        { actor: staffActor, handoffId: 'handoff-1' },
        { supportHandoffs: wrongStaff }
      )
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'actor_scope' });

    const wrongBranch = handoffRepository(handoff({ branchId: 'branch-2' }));
    await expect(
      listSupportHandoffTimeline(
        { actor: staffActor, handoffId: 'handoff-1' },
        { supportHandoffs: wrongBranch }
      )
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'actor_scope' });
  });
});

describe('CRM timeline read authorization helpers', () => {
  it('keeps lead and support-handoff aggregate scope explicit', () => {
    expect(authorizeCrmLeadTimelineRead(agentActor, lead())).toEqual({ allowed: true });
    expect(authorizeCrmLeadTimelineRead(agentActor, lead({ agentId: 'agent-2' }))).toEqual({
      allowed: false,
      reason: 'actor_scope',
    });
    expect(authorizeSupportHandoffTimelineRead(staffActor, handoff({ staffId: null }))).toEqual({
      allowed: true,
    });
    expect(
      authorizeSupportHandoffTimelineRead(staffActor, handoff({ tenantId: 'tenant-2' }))
    ).toEqual({
      allowed: false,
      reason: 'tenant_scope',
    });
    expect(authorizeCrmLeadTimelineRead(branchManagerWithoutBranch, lead())).toEqual({
      allowed: false,
      reason: 'actor_scope',
    });
    expect(
      authorizeSupportHandoffTimelineRead(branchManagerWithoutBranch, handoff({ staffId: null }))
    ).toEqual({
      allowed: false,
      reason: 'actor_scope',
    });
  });
});
