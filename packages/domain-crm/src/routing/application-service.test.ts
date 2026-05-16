import { describe, expect, it, vi, type MockedFunction } from 'vitest';

import type { CrmActorContext } from '../context';
import type { CreateCrmOutboxEventData, CrmOutboxEvent } from '../outbox/types';
import type { CrmOutboxAppendResult } from '../outbox/repository';
import {
  applyCrmLeadRoutingDecision,
  CrmRoutingApplicationRollback,
  type CrmLeadRoutingApplicationPorts,
} from './application-service';
import type {
  CrmRoutingAssignmentAuditRecord,
  CrmRoutingCursorAdvancement,
  CrmRoutingCursorMap,
  CrmRoutingLeadSnapshot,
  CrmRoutingRule,
  CrmRoutingWorkloadSnapshot,
} from './types';

const now = '2026-05-16T10:00:00.000Z';

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

const staffActor: CrmActorContext = {
  actorId: 'staff-1',
  role: 'staff',
  scope: { branchId: 'branch-1' },
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
    strategy: 'round_robin',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function workload(): CrmRoutingWorkloadSnapshot {
  return {
    agents: {
      'agent-1': { newLeadsAssignedToday: 0, openFollowUps: 0, openLeads: 0 },
      'agent-2': { newLeadsAssignedToday: 0, openFollowUps: 0, openLeads: 0 },
    },
    snapshotAt: now,
  };
}

function storedOutboxEvent(event: CreateCrmOutboxEventData): CrmOutboxEvent {
  return {
    aggregateId: event.event.aggregateId,
    aggregateType: event.event.aggregateType,
    availableAt: event.availableAt,
    createdAt: now,
    event: event.event,
    id: event.id,
    idempotencyKey: event.idempotencyKey,
    retryCount: 0,
    status: 'pending',
    tenantId: event.event.tenantId,
    type: event.event.type,
  };
}

class InMemoryRoutingApplicationPorts implements CrmLeadRoutingApplicationPorts {
  auditReplay: CrmRoutingAssignmentAuditRecord | null = null;
  audits: CrmRoutingAssignmentAuditRecord[] = [];
  cursorConflictsRemaining = 0;
  cursors: CrmRoutingCursorMap = {};
  leadSnapshots: CrmRoutingLeadSnapshot[] = [lead()];
  outboxEvents: CreateCrmOutboxEventData[] = [];
  rules: CrmRoutingRule[] = [rule()];
  transfers: unknown[] = [];

  readonly advanceRoutingCursor = vi.fn(
    async (params: { advancement: CrmRoutingCursorAdvancement }) => {
      if (this.cursorConflictsRemaining > 0) {
        this.cursorConflictsRemaining -= 1;
        return { reason: 'cursor_conflict' as const, success: false as const };
      }
      this.cursors = {
        ...this.cursors,
        [params.advancement.ruleId]: params.advancement.nextCursor,
      };
      return { advancement: params.advancement, success: true as const };
    }
  );

  readonly appendRoutingAssignmentAudit: MockedFunction<
    CrmLeadRoutingApplicationPorts['appendRoutingAssignmentAudit']
  > = vi.fn(async (params: { auditRecord: CrmRoutingAssignmentAuditRecord }) => {
    this.audits.push(params.auditRecord);
    return { auditRecord: params.auditRecord, status: 'appended' as const };
  });

  readonly findRoutingAssignmentAuditByIdempotency = vi.fn(async () => this.auditReplay);

  readonly getLeadRoutingSnapshot = vi.fn(async () => this.leadSnapshots[0] ?? null);

  readonly getRoutingCursors = vi.fn(async () => this.cursors);

  readonly getRoutingWorkloadSnapshot = vi.fn(async () => workload());

  readonly listRoutingRules = vi.fn(async () => this.rules);

  readonly outbox = {
    appendEvent: vi.fn(
      async (params: { event: CreateCrmOutboxEventData }): Promise<CrmOutboxAppendResult> => {
        this.outboxEvents.push(params.event);
        return { outboxEvent: storedOutboxEvent(params.event), status: 'enqueued' };
      }
    ),
  };

  readonly services = {
    outboxEventId: vi.fn(() => 'outbox-1'),
  };

  readonly transferLeadOwnership = vi.fn(async params => {
    this.transfers.push(params);
    return true;
  });
}

function input(overrides: Partial<Parameters<typeof applyCrmLeadRoutingDecision>[0]> = {}) {
  return {
    actor: managerActor,
    idempotencyKey: 'route:lead-1',
    leadId: 'lead-1',
    now,
    ...overrides,
  };
}

describe('applyCrmLeadRoutingDecision', () => {
  it('fails closed before repository reads for unauthorized actors and blank idempotency keys', async () => {
    const ports = new InMemoryRoutingApplicationPorts();

    await expect(applyCrmLeadRoutingDecision(input({ actor: staffActor }), ports)).resolves.toEqual(
      { outcome: 'rejected', reason: 'role_scope' }
    );
    await expect(
      applyCrmLeadRoutingDecision(input({ idempotencyKey: '   ' }), ports)
    ).resolves.toEqual({ outcome: 'rejected', reason: 'invalid_override' });

    expect(ports.getLeadRoutingSnapshot).not.toHaveBeenCalled();
    expect(ports.findRoutingAssignmentAuditByIdempotency).not.toHaveBeenCalled();
    expect(ports.audits).toHaveLength(0);
    expect(ports.outboxEvents).toHaveLength(0);
  });

  it('returns idempotent replay without reselecting or writing', async () => {
    const ports = new InMemoryRoutingApplicationPorts();
    ports.auditReplay = {
      actorId: 'manager-1',
      agentId: 'agent-2',
      branchId: 'branch-1',
      idempotencyKey: 'route:lead-1',
      leadId: 'lead-1',
      occurredAt: now,
      reasonCode: 'rule_match',
      ruleId: 'rule-1',
      strategy: 'round_robin',
      tenantId: 'tenant-1',
    };

    await expect(applyCrmLeadRoutingDecision(input(), ports)).resolves.toEqual({
      agentId: 'agent-2',
      outcome: 'idempotent_replay',
      ruleId: 'rule-1',
      strategy: 'round_robin',
    });

    expect(ports.getLeadRoutingSnapshot).not.toHaveBeenCalled();
    expect(ports.audits).toHaveLength(0);
    expect(ports.outboxEvents).toHaveLength(0);
  });

  it('rejects replay divergence for the same idempotency key', async () => {
    const ports = new InMemoryRoutingApplicationPorts();
    ports.auditReplay = {
      actorId: 'someone-else',
      agentId: 'agent-2',
      branchId: 'branch-1',
      idempotencyKey: 'route:lead-1',
      leadId: 'lead-1',
      occurredAt: now,
      reasonCode: 'rule_match',
      ruleId: 'rule-1',
      strategy: 'round_robin',
      tenantId: 'tenant-1',
    };

    await expect(applyCrmLeadRoutingDecision(input(), ports)).resolves.toEqual({
      outcome: 'rejected',
      reason: 'invalid_override',
    });
  });

  it('routes a lead with cursor advance, ownership transfer, audit append, and outbox append', async () => {
    const ports = new InMemoryRoutingApplicationPorts();
    ports.cursors = { 'rule-1': 'agent-1' };

    await expect(applyCrmLeadRoutingDecision(input(), ports)).resolves.toMatchObject({
      agentId: 'agent-2',
      outcome: 'routed',
      ownershipChanged: true,
      ruleId: 'rule-1',
      strategy: 'round_robin',
    });

    expect(ports.advanceRoutingCursor).toHaveBeenCalledTimes(1);
    expect(ports.transferLeadOwnership).toHaveBeenCalledWith(
      expect.objectContaining({
        currentAgentId: 'agent-old',
        leadId: 'lead-1',
        targetAgentId: 'agent-2',
      })
    );
    expect(ports.audits).toHaveLength(1);
    expect(ports.outboxEvents).toHaveLength(1);
    expect(ports.outboxEvents[0]?.event).toMatchObject({
      aggregateId: 'lead-1',
      payload: { agentId: 'agent-2', leadId: 'lead-1', ruleId: 'rule-1' },
      type: 'crm.lead.routed',
    });
  });

  it('keeps same-owner routing auditable without ownership transfer', async () => {
    const ports = new InMemoryRoutingApplicationPorts();
    ports.leadSnapshots = [lead({ assignedAgentId: 'agent-2' })];
    ports.cursors = { 'rule-1': 'agent-1' };

    await expect(applyCrmLeadRoutingDecision(input({ actor: adminActor }), ports)).resolves.toEqual(
      expect.objectContaining({
        outcome: 'routed',
        ownershipChanged: false,
      })
    );

    expect(ports.transferLeadOwnership).not.toHaveBeenCalled();
    expect(ports.audits).toHaveLength(1);
    expect(ports.outboxEvents).toHaveLength(1);
  });

  it('returns manual review and no_rule without writes', async () => {
    const manualPorts = new InMemoryRoutingApplicationPorts();
    manualPorts.rules = [rule({ strategy: 'manual_only' })];
    await expect(applyCrmLeadRoutingDecision(input(), manualPorts)).resolves.toEqual({
      outcome: 'manual_review',
      reason: 'manual_only',
      ruleId: 'rule-1',
    });

    const noRulePorts = new InMemoryRoutingApplicationPorts();
    noRulePorts.rules = [rule({ source: 'referral' })];
    await expect(applyCrmLeadRoutingDecision(input(), noRulePorts)).resolves.toEqual({
      outcome: 'no_rule',
    });

    expect(manualPorts.audits).toHaveLength(0);
    expect(noRulePorts.outboxEvents).toHaveLength(0);
  });

  it('returns stale_lead for terminal, dedupe, and concurrent owner-change states', async () => {
    const terminalPorts = new InMemoryRoutingApplicationPorts();
    terminalPorts.leadSnapshots = [lead({ lifecycleState: 'won' })];
    await expect(applyCrmLeadRoutingDecision(input(), terminalPorts)).resolves.toEqual({
      outcome: 'stale_lead',
      reason: 'lifecycle_terminal',
    });

    const dedupePorts = new InMemoryRoutingApplicationPorts();
    dedupePorts.leadSnapshots = [lead({ dedupeState: 'merge_pending' })];
    await expect(applyCrmLeadRoutingDecision(input(), dedupePorts)).resolves.toEqual({
      outcome: 'stale_lead',
      reason: 'dedupe_state',
    });

    const concurrentPorts = new InMemoryRoutingApplicationPorts();
    concurrentPorts.getLeadRoutingSnapshot.mockResolvedValueOnce(lead());
    concurrentPorts.getLeadRoutingSnapshot.mockResolvedValueOnce(
      lead({ assignedAgentId: 'agent-raced' })
    );
    await expect(applyCrmLeadRoutingDecision(input(), concurrentPorts)).resolves.toEqual({
      outcome: 'stale_lead',
      reason: 'concurrent_owner_change',
    });
  });

  it('retries cursor conflicts at most three times', async () => {
    const retryPorts = new InMemoryRoutingApplicationPorts();
    retryPorts.cursorConflictsRemaining = 2;
    await expect(applyCrmLeadRoutingDecision(input(), retryPorts)).resolves.toMatchObject({
      outcome: 'routed',
    });
    expect(retryPorts.advanceRoutingCursor).toHaveBeenCalledTimes(3);

    const exhaustedPorts = new InMemoryRoutingApplicationPorts();
    exhaustedPorts.cursorConflictsRemaining = 3;
    await expect(applyCrmLeadRoutingDecision(input(), exhaustedPorts)).resolves.toEqual({
      outcome: 'cursor_conflict_exhausted',
    });
    expect(exhaustedPorts.audits).toHaveLength(0);
    expect(exhaustedPorts.outboxEvents).toHaveLength(0);
  });

  it('throws a rollback signal when a post-cursor ownership failure would otherwise commit partial writes', async () => {
    const ports = new InMemoryRoutingApplicationPorts();
    ports.transferLeadOwnership.mockResolvedValueOnce(false);
    ports.cursors = { 'rule-1': 'agent-1' };

    try {
      await applyCrmLeadRoutingDecision(input(), ports);
      throw new Error('expected rollback signal');
    } catch (error) {
      expect(error).toBeInstanceOf(CrmRoutingApplicationRollback);
      expect(error).toMatchObject({
        result: { outcome: 'stale_lead', reason: 'concurrent_owner_change' },
      });
    }
    expect(ports.advanceRoutingCursor).toHaveBeenCalledTimes(1);
    expect(ports.audits).toHaveLength(0);
    expect(ports.outboxEvents).toHaveLength(0);
  });

  it('throws a rollback signal when an idempotency conflict returns a divergent audit row', async () => {
    const ports = new InMemoryRoutingApplicationPorts();
    ports.appendRoutingAssignmentAudit.mockResolvedValueOnce({
      auditRecord: {
        actorId: 'manager-1',
        agentId: 'agent-2',
        branchId: 'branch-raced',
        idempotencyKey: 'route:lead-1',
        leadId: 'lead-1',
        occurredAt: now,
        reasonCode: 'fallback_agent',
        ruleId: 'rule-1',
        strategy: 'round_robin',
        tenantId: 'tenant-1',
      },
      status: 'existing',
    });

    await expect(applyCrmLeadRoutingDecision(input(), ports)).rejects.toMatchObject({
      result: { outcome: 'rejected', reason: 'invalid_override' },
    });
    expect(ports.outboxEvents).toHaveLength(0);
  });

  it('throws an idempotent rollback signal when a late same-key audit replay is identical', async () => {
    const ports = new InMemoryRoutingApplicationPorts();
    ports.appendRoutingAssignmentAudit.mockImplementationOnce(async params => ({
      auditRecord: params.auditRecord,
      status: 'existing' as const,
    }));

    await expect(applyCrmLeadRoutingDecision(input(), ports)).rejects.toMatchObject({
      result: {
        agentId: 'agent-1',
        outcome: 'idempotent_replay',
        ruleId: 'rule-1',
        strategy: 'round_robin',
      },
    });
    expect(ports.outboxEvents).toHaveLength(0);
  });
});
