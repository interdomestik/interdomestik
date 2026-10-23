import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CrmRoutingApplicationRollback,
  type ApplyCrmLeadRoutingDecisionResult,
} from '@interdomestik/domain-crm/routing';
import { outboxEvent, createFakeDatabase } from './routing-application-service.fixture';
import {
  crmLeadOwnershipHistory,
  crmLeads,
  crmRoutingAssignmentsAudit,
  crmRoutingCursors,
} from '@interdomestik/database/schema';

const applyMock = vi.hoisted(() => vi.fn());
const tenantMock = vi.hoisted(() => vi.fn());
vi.mock('@interdomestik/database/tenant', () => ({ withTenantContext: tenantMock }));

vi.mock('@interdomestik/domain-crm/routing', async importActual => {
  const actual = await importActual<typeof import('@interdomestik/domain-crm/routing')>();
  return {
    ...actual,
    applyCrmLeadRoutingDecision: applyMock,
  };
});

import { createApplyCrmLeadRoutingDecisionCoordinator } from './routing-application-service';

const actor = {
  actorId: 'manager-1',
  role: 'branch_manager' as const,
  scope: { branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

describe('routing application service coordinator', () => {
  beforeEach(() => {
    applyMock.mockReset();
    tenantMock.mockReset();
  });

  it('runs ownership, cursor, audit, and outbox calls inside one transaction', async () => {
    const fake = createFakeDatabase();
    tenantMock.mockImplementation((_context, callback) => fake.database.transaction(callback));
    const outboxTransactionIds: Array<string | null> = [];
    const outbox = {
      appendEvent: vi.fn(async () => {
        outboxTransactionIds.push(fake.activeTransactionId());
        return { outboxEvent, status: 'enqueued' as const };
      }),
    };
    const createOutboxPort = vi.fn(transaction => {
      expect(transaction).toBeDefined();
      return outbox;
    });

    applyMock.mockImplementation(async (_input, ports) => {
      await ports.transferLeadOwnership({
        actor,
        currentAgentId: 'agent-old',
        currentBranchId: 'branch-1',
        leadId: 'lead-1',
        reason: 'routing_rule',
        targetAgentId: 'agent-2',
        targetBranchId: 'branch-1',
      });
      await ports.advanceRoutingCursor({
        advancement: {
          agentId: 'agent-2',
          nextCursor: 'agent-2',
          priorCursor: 'agent-1',
          ruleId: 'rule-1',
          tenantId: 'tenant-1',
        },
        idempotencyKey: 'route:lead-1',
      });
      await ports.appendRoutingAssignmentAudit({
        auditRecord: {
          actorId: 'manager-1',
          agentId: 'agent-2',
          branchId: 'branch-1',
          idempotencyKey: 'route:lead-1',
          leadId: 'lead-1',
          occurredAt: '2026-05-16T10:00:00.000Z',
          reasonCode: 'rule_match',
          ruleId: 'rule-1',
          strategy: 'round_robin',
          tenantId: 'tenant-1',
        },
        idempotencyKey: 'route:lead-1',
      });
      await ports.outbox.appendEvent({ event: {} });
      return {
        agentId: 'agent-2',
        event: {
          agentId: 'agent-2',
          branchId: 'branch-1',
          fromAgentId: 'agent-old',
          leadId: 'lead-1',
          reasonCode: 'rule_match',
          ruleId: 'rule-1',
          strategy: 'round_robin',
        },
        outcome: 'routed',
        ownershipChanged: true,
        ruleId: 'rule-1',
        strategy: 'round_robin',
      } satisfies ApplyCrmLeadRoutingDecisionResult;
    });

    const apply = createApplyCrmLeadRoutingDecisionCoordinator({
      createOutboxPort,
      services: { outboxEventId: () => 'outbox-1' },
    });

    await expect(
      apply({
        actor,
        idempotencyKey: 'route:lead-1',
        leadId: 'lead-1',
        now: '2026-05-16T10:00:00.000Z',
      })
    ).resolves.toMatchObject({ outcome: 'routed' });

    expect(tenantMock).toHaveBeenCalledWith({ tenantId: actor.tenantId }, expect.any(Function));
    expect(fake.transactionIds).toEqual(['tx-1']);
    expect(createOutboxPort).toHaveBeenCalledTimes(1);
    expect(fake.writeTables).toEqual([
      crmLeads,
      crmLeadOwnershipHistory,
      crmLeadOwnershipHistory,
      crmRoutingCursors,
      crmRoutingAssignmentsAudit,
    ]);
    expect(outboxTransactionIds).toEqual(['tx-1']);
  });

  it('rolls back transaction writes when the domain service raises a typed rollback', async () => {
    const fake = createFakeDatabase();
    tenantMock.mockImplementation((_context, callback) => fake.database.transaction(callback));
    applyMock.mockImplementation(async (_input, ports) => {
      await ports.advanceRoutingCursor({
        advancement: {
          agentId: 'agent-2',
          nextCursor: 'agent-2',
          priorCursor: 'agent-1',
          ruleId: 'rule-1',
          tenantId: 'tenant-1',
        },
        idempotencyKey: 'route:lead-1',
      });
      throw new CrmRoutingApplicationRollback({
        outcome: 'stale_lead',
        reason: 'concurrent_owner_change',
      });
    });

    const apply = createApplyCrmLeadRoutingDecisionCoordinator({
      createOutboxPort: () => ({ appendEvent: vi.fn() }),
    });

    await expect(
      apply({
        actor,
        idempotencyKey: 'route:lead-1',
        leadId: 'lead-1',
        now: '2026-05-16T10:00:00.000Z',
      })
    ).resolves.toEqual({ outcome: 'stale_lead', reason: 'concurrent_owner_change' });

    expect(fake.writeTables).toEqual([crmRoutingCursors]);
    expect(fake.committedWriteTables).toEqual([]);
  });
});
