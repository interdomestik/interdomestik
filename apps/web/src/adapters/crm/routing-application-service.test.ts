import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actor,
  applyMock,
  createFakeDatabase,
  outboxEvent,
} from './routing-application-service.test-support';
import {
  CrmRoutingApplicationRollback,
  type ApplyCrmLeadRoutingDecisionResult,
} from '@interdomestik/domain-crm/routing';
import {
  crmLeadOwnershipHistory,
  crmLeads,
  crmRoutingAssignmentsAudit,
  crmRoutingCursors,
} from '@interdomestik/database/schema';
import { createApplyCrmLeadRoutingDecisionCoordinator } from './routing-application-service';

describe('routing application service coordinator', () => {
  beforeEach(() => {
    applyMock.mockReset();
  });

  it('runs ownership, cursor, audit, and outbox calls inside one transaction', async () => {
    const fake = createFakeDatabase();
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
      authority: mintTestTenantAuthority('tenant-1'),
      executor: fake.database as never,
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
      authority: mintTestTenantAuthority('tenant-1'),
      executor: fake.database as never,
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

  it('maps unexpected adapter failures to repository_failure', async () => {
    const fake = createFakeDatabase();
    applyMock.mockRejectedValueOnce(new Error('db unavailable'));

    const apply = createApplyCrmLeadRoutingDecisionCoordinator({
      authority: mintTestTenantAuthority('tenant-1'),
      executor: fake.database as never,
      createOutboxPort: () => ({ appendEvent: vi.fn() }),
    });

    await expect(
      apply({
        actor,
        idempotencyKey: 'route:lead-1',
        leadId: 'lead-1',
        now: '2026-05-16T10:00:00.000Z',
      })
    ).resolves.toEqual({ outcome: 'repository_failure' });
  });
});
