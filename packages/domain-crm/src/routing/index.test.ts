import { describe, expect, expectTypeOf, it } from 'vitest';

import type { CrmActorContext } from '../context';
import type { CrmDomainEvent, CrmLeadRoutedEvent } from '../outbox/types';
import type {
  CrmRoutingAssignmentAuditRecord,
  CrmRoutingCursorAdvancement,
  CrmRoutingCursorAdvanceResult,
  CrmRoutingRepository,
  CrmRoutingRule,
} from './repository';
import type {
  CrmRoutingLeadSnapshot,
  CrmRoutingRejectionReason,
  CrmRoutingWorkloadSnapshot,
} from './types';
import { selectCrmLeadAssignee } from './mutations';

const now = '2026-05-14T10:00:00.000Z';

const adminActor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: {},
  tenantId: 'tenant-1',
};

const managerActor: CrmActorContext = {
  actorId: 'manager-1',
  role: 'branch_manager',
  scope: { branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

function lead(overrides: Partial<CrmRoutingLeadSnapshot> = {}): CrmRoutingLeadSnapshot {
  return {
    assignedAgentId: 'agent-old',
    branchId: 'branch-1',
    dedupeState: 'clean',
    id: 'lead-1',
    lifecycleState: 'qualified',
    source: 'website',
    tenantId: 'tenant-1',
    type: 'business',
    utmCampaign: 'spring',
    utmMedium: 'cpc',
    utmSource: 'google',
    ...overrides,
  };
}

function rule(overrides: Partial<CrmRoutingRule> = {}): CrmRoutingRule {
  return {
    agentIds: ['agent-1', 'agent-2'],
    branchId: 'branch-1',
    enabled: true,
    id: 'rule-1',
    leadType: 'business',
    priority: 10,
    source: 'website',
    strategy: 'least_loaded',
    tenantId: 'tenant-1',
    utmCampaign: 'spring',
    utmMedium: 'cpc',
    utmSource: 'google',
    ...overrides,
  };
}

function workload(overrides: Partial<CrmRoutingWorkloadSnapshot> = {}): CrmRoutingWorkloadSnapshot {
  return {
    agents: {
      'agent-1': {
        capacityState: 'available',
        newLeadsAssignedToday: 2,
        openFollowUps: 2,
        openLeads: 4,
      },
      'agent-2': {
        capacityState: 'available',
        newLeadsAssignedToday: 1,
        openFollowUps: 1,
        openLeads: 1,
      },
      'agent-3': {
        capacityState: 'available',
        newLeadsAssignedToday: 1,
        openFollowUps: 1,
        openLeads: 1,
      },
    },
    snapshotAt: '2026-05-14T09:55:00.000Z',
    ...overrides,
  };
}

class InMemoryRoutingRepository implements CrmRoutingRepository {
  readonly auditRecords: CrmRoutingAssignmentAuditRecord[] = [];
  readonly rules: CrmRoutingRule[];
  readonly cursors = new Map<string, string | null>();

  constructor(rules: readonly CrmRoutingRule[] = []) {
    this.rules = [...rules];
  }

  async appendRoutingAssignmentAudit(params: {
    auditRecord: CrmRoutingAssignmentAuditRecord;
    idempotencyKey?: string | null;
  }): Promise<CrmRoutingAssignmentAuditRecord> {
    this.auditRecords.push(params.auditRecord);
    return params.auditRecord;
  }

  async advanceRoutingCursor(params: {
    advancement: CrmRoutingCursorAdvancement;
    idempotencyKey?: string | null;
  }): Promise<CrmRoutingCursorAdvanceResult> {
    const current = this.cursors.get(params.advancement.ruleId) ?? null;
    if (current !== params.advancement.priorCursor) {
      return { success: false, reason: 'cursor_conflict' };
    }
    this.cursors.set(params.advancement.ruleId, params.advancement.nextCursor);
    return { success: true, advancement: params.advancement };
  }

  async listRoutingRules(params: { actor: CrmActorContext }): Promise<readonly CrmRoutingRule[]> {
    void params;
    return this.rules;
  }
}

describe('CRM routing', () => {
  it('matches enabled rules by tenant, branch, source, type, UTM, effective window, and priority', () => {
    const decision = selectCrmLeadAssignee(
      {
        actor: managerActor,
        idempotencyKey: 'route:lead-1',
        lead: lead(),
        now,
      },
      [
        rule({ id: 'rule-lower-priority', priority: 20, strategy: 'round_robin' }),
        rule({
          effectiveFrom: '2026-05-14T00:00:00.000Z',
          effectiveTo: '2026-05-14T23:59:59.000Z',
          id: 'rule-top',
          priority: 1,
        }),
      ],
      workload(),
      {}
    );

    expect(decision).toMatchObject({
      agentId: 'agent-2',
      auditRecord: {
        actorId: 'manager-1',
        agentId: 'agent-2',
        branchId: 'branch-1',
        idempotencyKey: 'route:lead-1',
        leadId: 'lead-1',
        occurredAt: now,
        reasonCode: 'rule_match',
        ruleId: 'rule-top',
        strategy: 'least_loaded',
        tenantId: 'tenant-1',
      },
      event: {
        agentId: 'agent-2',
        branchId: 'branch-1',
        fromAgentId: 'agent-old',
        leadId: 'lead-1',
        reasonCode: 'rule_match',
        ruleId: 'rule-top',
        strategy: 'least_loaded',
      },
      outcome: 'assigned',
      ruleId: 'rule-top',
      strategy: 'least_loaded',
    });
  });

  it('returns cursor advancement for round-robin without mutating cursor state', async () => {
    const repository = new InMemoryRoutingRepository();
    repository.cursors.set('rule-1', 'agent-1');

    const decision = selectCrmLeadAssignee(
      { actor: managerActor, lead: lead(), now },
      [rule({ agentIds: ['agent-1', 'agent-2', 'agent-3'], strategy: 'round_robin' })],
      workload(),
      { 'rule-1': 'agent-1' }
    );

    expect(decision).toMatchObject({
      agentId: 'agent-2',
      cursorAdvancement: {
        agentId: 'agent-2',
        nextCursor: 'agent-2',
        priorCursor: 'agent-1',
        ruleId: 'rule-1',
      },
      outcome: 'assigned',
    });
    expect(repository.cursors.get('rule-1')).toBe('agent-1');

    if (decision.outcome !== 'assigned' || !decision.cursorAdvancement) {
      throw new Error('expected round-robin assignment');
    }
    await expect(
      repository.advanceRoutingCursor({ advancement: decision.cursorAdvancement })
    ).resolves.toEqual({
      success: true,
      advancement: decision.cursorAdvancement,
    });
    await expect(
      repository.advanceRoutingCursor({ advancement: decision.cursorAdvancement })
    ).resolves.toEqual({
      success: false,
      reason: 'cursor_conflict',
    });
  });

  it('uses deterministic least-loaded tie-breaking', () => {
    const decision = selectCrmLeadAssignee(
      { actor: adminActor, lead: lead(), now },
      [rule({ agentIds: ['agent-3', 'agent-2'], branchId: null })],
      workload(),
      {}
    );

    expect(decision).toMatchObject({
      agentId: 'agent-2',
      outcome: 'assigned',
      strategy: 'least_loaded',
    });
  });

  it('returns manual review for manual-only rules and manual override attempts', () => {
    expect(
      selectCrmLeadAssignee(
        { actor: managerActor, lead: lead(), now },
        [rule({ strategy: 'manual_only' })],
        workload(),
        {}
      )
    ).toEqual({ outcome: 'manual_review', reason: 'manual_only', ruleId: 'rule-1' });

    expect(
      selectCrmLeadAssignee(
        {
          actor: managerActor,
          lead: lead(),
          now,
          override: { agentId: 'agent-2', reason: 'VIP owner continuity' },
        },
        [rule()],
        workload(),
        {}
      )
    ).toEqual({ outcome: 'manual_review', reason: 'manual_override_direct_transfer' });
  });

  it('checks authorization and lead eligibility before accepting manual override attempts', () => {
    expect(
      selectCrmLeadAssignee(
        {
          actor: agentActor,
          lead: lead(),
          now,
          override: { agentId: 'agent-2', reason: 'manual' },
        },
        [rule()],
        workload(),
        {}
      )
    ).toEqual({ outcome: 'rejected', reason: 'role_scope' });

    expect(
      selectCrmLeadAssignee(
        {
          actor: managerActor,
          lead: lead({ lifecycleState: 'archived' }),
          now,
          override: { agentId: 'agent-2', reason: 'manual' },
        },
        [rule()],
        workload(),
        {}
      )
    ).toEqual({ outcome: 'rejected', reason: 'lead_state' });
  });

  it('returns no_rule when no enabled rule matches', () => {
    expect(
      selectCrmLeadAssignee(
        { actor: managerActor, lead: lead({ source: 'referral' }), now },
        [rule()],
        workload(),
        {}
      )
    ).toEqual({ outcome: 'no_rule' });
  });

  it('rejects forbidden actors before assignment', () => {
    expect(
      selectCrmLeadAssignee({ actor: agentActor, lead: lead(), now }, [rule()], workload(), {})
    ).toEqual({ outcome: 'rejected', reason: 'role_scope' });

    expect(
      selectCrmLeadAssignee(
        { actor: managerActor, lead: lead({ branchId: 'branch-2' }), now },
        [rule()],
        workload(),
        {}
      )
    ).toEqual({ outcome: 'rejected', reason: 'branch_scope' });

    expect(
      selectCrmLeadAssignee(
        { actor: managerActor, lead: lead({ tenantId: 'tenant-2' }), now },
        [rule()],
        workload(),
        {}
      )
    ).toEqual({ outcome: 'rejected', reason: 'tenant_scope' });
  });

  it('rejects stale workload snapshots', () => {
    expect(
      selectCrmLeadAssignee(
        { actor: managerActor, lead: lead(), now },
        [rule()],
        workload({ snapshotAt: '2026-05-14T09:44:59.000Z' }),
        {}
      )
    ).toEqual({ outcome: 'rejected', reason: 'stale_workload_snapshot' });
  });

  it('rejects dedupe states that require merge review', () => {
    for (const dedupeState of ['merge_pending', 'merged_loser'] as const) {
      expect(
        selectCrmLeadAssignee(
          { actor: managerActor, lead: lead({ dedupeState }), now },
          [rule()],
          workload(),
          {}
        )
      ).toEqual({ outcome: 'rejected', reason: 'dedupe_state' });
    }
  });

  it('rejects terminal or non-routable lead states', () => {
    for (const lifecycleState of ['archived', 'converted', 'closed', 'lost', 'won'] as const) {
      expect(
        selectCrmLeadAssignee(
          { actor: managerActor, lead: lead({ lifecycleState }), now },
          [rule()],
          workload(),
          {}
        )
      ).toEqual({ outcome: 'rejected', reason: 'lead_state' });
    }
  });

  it('rejects empty pools, capacity saturation, and invalid overrides', () => {
    expect(
      selectCrmLeadAssignee(
        { actor: managerActor, lead: lead(), now },
        [rule({ agentIds: [] })],
        workload(),
        {}
      )
    ).toEqual({ outcome: 'rejected', reason: 'empty_agent_pool' });

    expect(
      selectCrmLeadAssignee(
        { actor: managerActor, lead: lead(), now },
        [rule({ agentIds: [' ', ''] })],
        workload(),
        {}
      )
    ).toEqual({ outcome: 'rejected', reason: 'empty_agent_pool' });

    expect(
      selectCrmLeadAssignee(
        { actor: managerActor, lead: lead(), now },
        [rule({ maxOpenLeadsPerAgent: 1 })],
        workload(),
        {}
      )
    ).toEqual({ outcome: 'rejected', reason: 'capacity' });

    expect(
      selectCrmLeadAssignee(
        { actor: managerActor, lead: lead(), now, override: { agentId: ' ', reason: 'manual' } },
        [rule()],
        workload(),
        {}
      )
    ).toEqual({ outcome: 'rejected', reason: 'invalid_override' });
  });

  it('can use a fallback agent when all explicit pool members are unavailable', () => {
    const decision = selectCrmLeadAssignee(
      { actor: managerActor, lead: lead(), now },
      [rule({ fallbackAgentId: 'agent-fallback', maxOpenLeadsPerAgent: 1 })],
      workload(),
      {}
    );

    expect(decision).toMatchObject({
      agentId: 'agent-fallback',
      event: { reasonCode: 'fallback_agent' },
      outcome: 'assigned',
    });
  });

  it('can use a fallback rule when the matched rule pool is saturated', () => {
    const decision = selectCrmLeadAssignee(
      { actor: managerActor, lead: lead(), now },
      [
        rule({ fallbackRuleId: 'rule-fallback', maxOpenLeadsPerAgent: 1 }),
        rule({
          agentIds: ['agent-3'],
          id: 'rule-fallback',
          priority: 20,
          strategy: 'least_loaded',
        }),
      ],
      workload(),
      {}
    );

    expect(decision).toMatchObject({
      agentId: 'agent-3',
      event: { reasonCode: 'fallback_rule', ruleId: 'rule-fallback' },
      outcome: 'assigned',
      ruleId: 'rule-fallback',
    });
  });

  it('keeps the routed event and rejection reasons in the typed contracts', () => {
    expectTypeOf<CrmLeadRoutedEvent>().toMatchTypeOf<CrmDomainEvent>();
    expectTypeOf<'crm.lead.routed'>().toMatchTypeOf<CrmDomainEvent['type']>();

    const noMatchingRule: CrmRoutingRejectionReason = 'no_matching_rule';
    const cursorConflict: CrmRoutingRejectionReason = 'cursor_conflict';
    expect(noMatchingRule).toBe('no_matching_rule');
    expect(cursorConflict).toBe('cursor_conflict');
  });

  it('normalizes idempotency keys on audit records without duplicating them in routed event payloads', () => {
    const decision = selectCrmLeadAssignee(
      { actor: managerActor, idempotencyKey: '  route:lead-1  ', lead: lead(), now },
      [rule()],
      workload(),
      {}
    );

    if (decision.outcome !== 'assigned') {
      throw new Error('expected assignment');
    }

    expect(decision.auditRecord.idempotencyKey).toBe('route:lead-1');
    expect('idempotencyKey' in decision.event).toBe(false);

    const blankKeyDecision = selectCrmLeadAssignee(
      { actor: managerActor, idempotencyKey: '   ', lead: lead(), now },
      [rule()],
      workload(),
      {}
    );

    if (blankKeyDecision.outcome !== 'assigned') {
      throw new Error('expected assignment');
    }

    expect(blankKeyDecision.auditRecord.idempotencyKey).toBeNull();
  });
});
