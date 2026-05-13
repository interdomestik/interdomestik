import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '../context';
import {
  AGENT_CRM_LEAD_ACTIVITY_MAX_ROWS,
  authorizeAgentCrmLeadActivityRead,
  getAgentCrmLeadActivities,
  type AgentCrmLeadActivity,
  type AgentCrmLeadActivityLead,
  type AgentCrmLeadActivityRepository,
} from './index';

const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

function lead(overrides: Partial<AgentCrmLeadActivityLead> = {}): AgentCrmLeadActivityLead {
  return {
    agentId: 'agent-1',
    branchId: 'branch-1',
    id: 'lead-1',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function activity(overrides: Partial<AgentCrmLeadActivity> = {}): AgentCrmLeadActivity {
  return {
    agentId: 'agent-1',
    branchId: 'branch-1',
    completedAt: null,
    createdAt: '2026-05-12T10:00:00.000Z',
    description: null,
    id: 'activity-1',
    leadId: 'lead-1',
    occurredAt: '2026-05-12T10:00:00.000Z',
    scheduledAt: null,
    subject: 'Call lead',
    tenantId: 'tenant-1',
    type: 'call',
    ...overrides,
  };
}

function repository(args: {
  activities?: readonly AgentCrmLeadActivity[];
  lead?: AgentCrmLeadActivityLead | null;
}): AgentCrmLeadActivityRepository & {
  findAgentLead: ReturnType<typeof vi.fn>;
  listAgentLeadActivities: ReturnType<typeof vi.fn>;
} {
  return {
    findAgentLead: vi.fn().mockResolvedValue(args.lead === undefined ? lead() : args.lead),
    listAgentLeadActivities: vi.fn().mockResolvedValue(args.activities ?? [activity()]),
  };
}

describe('getAgentCrmLeadActivities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects non-agent actors before reading the repository', async () => {
    const repo = repository({});

    const result = await getAgentCrmLeadActivities(
      { actor: { ...actor, role: 'staff' }, leadId: 'lead-1' },
      repo
    );

    expect(result).toEqual({ success: false, error: 'forbidden', reason: 'role_scope' });
    expect(repo.findAgentLead).not.toHaveBeenCalled();
    expect(repo.listAgentLeadActivities).not.toHaveBeenCalled();
  });

  it('rejects wrong agent scope before reading the repository', async () => {
    const repo = repository({});

    const result = await getAgentCrmLeadActivities(
      {
        actor: { ...actor, scope: { agentId: 'other-agent', branchId: 'branch-1' } },
        leadId: 'lead-1',
      },
      repo
    );

    expect(result).toEqual({ success: false, error: 'forbidden', reason: 'agent_scope' });
    expect(repo.findAgentLead).not.toHaveBeenCalled();
  });

  it('rejects branchless actors before reading the repository', async () => {
    const repo = repository({});

    const result = await getAgentCrmLeadActivities(
      { actor: { ...actor, scope: { agentId: 'agent-1', branchId: null } }, leadId: 'lead-1' },
      repo
    );

    expect(result).toEqual({ success: false, error: 'forbidden', reason: 'branch_scope' });
    expect(repo.findAgentLead).not.toHaveBeenCalled();
  });

  it('returns not_found without reading activities when the lead is absent', async () => {
    const repo = repository({ lead: null });

    const result = await getAgentCrmLeadActivities({ actor, leadId: 'lead-1' }, repo);

    expect(result).toEqual({ success: false, error: 'not_found' });
    expect(repo.listAgentLeadActivities).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant, wrong-agent, and wrong-branch lead custody before reading activities', async () => {
    for (const [candidate, reason] of [
      [lead({ tenantId: 'tenant-2' }), 'tenant_scope'],
      [lead({ agentId: 'agent-2' }), 'agent_scope'],
      [lead({ branchId: 'branch-2' }), 'branch_scope'],
    ] as const) {
      const repo = repository({ lead: candidate });

      const result = await getAgentCrmLeadActivities({ actor, leadId: 'lead-1' }, repo);

      expect(result).toEqual({ success: false, error: 'forbidden', reason });
      expect(repo.listAgentLeadActivities).not.toHaveBeenCalled();
    }
  });

  it('returns only tenant, agent, branch, and lead scoped activities', async () => {
    const allowed = activity({ id: 'allowed' });
    const repo = repository({
      activities: [
        allowed,
        activity({ id: 'cross-tenant', tenantId: 'tenant-2' }),
        activity({ id: 'wrong-agent', agentId: 'agent-2' }),
        activity({ id: 'wrong-branch', branchId: 'branch-2' }),
        activity({ id: 'missing-branch', branchId: null }),
        activity({ id: 'wrong-lead', leadId: 'lead-2' }),
      ],
    });

    const result = await getAgentCrmLeadActivities({ actor, leadId: 'lead-1' }, repo);

    expect(result).toEqual({ success: true, activities: [allowed] });
  });

  it('caps repository reads to the lead activity max rows', async () => {
    const repo = repository({});

    await getAgentCrmLeadActivities({ actor, leadId: 'lead-1', limit: 500 }, repo);

    expect(repo.listAgentLeadActivities).toHaveBeenCalledWith({
      actor,
      lead: lead(),
      limit: AGENT_CRM_LEAD_ACTIVITY_MAX_ROWS,
    });
  });

  it('normalizes fractional limits before reading the repository', async () => {
    const repo = repository({});

    await getAgentCrmLeadActivities({ actor, leadId: 'lead-1', limit: 1.5 }, repo);

    expect(repo.listAgentLeadActivities).toHaveBeenCalledWith({
      actor,
      lead: lead(),
      limit: 1,
    });
  });

  it('classifies lead mismatches separately from agent scope mismatches', () => {
    expect(authorizeAgentCrmLeadActivityRead(actor, lead(), activity({ leadId: 'lead-2' }))).toBe(
      'lead_scope'
    );
  });
});
