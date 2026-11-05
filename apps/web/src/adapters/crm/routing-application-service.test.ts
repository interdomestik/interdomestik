import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actor,
  createFakeDatabase,
  outboxEvent,
  planMock,
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

const input = {
  actor,
  idempotencyKey: 'route:lead-1',
  leadId: 'lead-1',
  now: '2026-05-16T10:00:00.000Z',
};
const cursorAdvance = {
  operation: 'advanceRoutingCursor',
  params: {
    advancement: {
      agentId: 'agent-2',
      nextCursor: 'agent-2',
      priorCursor: 'agent-1',
      ruleId: 'rule-1',
      tenantId: 'tenant-1',
    },
    idempotencyKey: 'route:lead-1',
  },
} as const;
const routed = {
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

function coordinator(outbox = { appendEvent: vi.fn() }) {
  return createApplyCrmLeadRoutingDecisionCoordinator({
    authority: mintTestTenantAuthority('tenant-1'),
    outbox,
    services: { outboxEventId: () => 'outbox-1' },
  });
}

describe('routing application service coordinator', () => {
  beforeEach(() => {
    planMock.mockReset();
  });

  it('performs ownership, cursor, audit, and outbox requests inside one transaction', async () => {
    const fake = createFakeDatabase();
    const outboxTransactionIds: Array<string | null> = [];
    const outbox = {
      appendEvent: vi.fn(async () => {
        outboxTransactionIds.push(fake.activeTransactionId());
        return { outboxEvent, status: 'enqueued' as const };
      }),
    };
    const answers: unknown[] = [];
    planMock.mockImplementation(function* () {
      answers.push(
        yield {
          operation: 'transferLeadOwnership',
          params: {
            actor,
            currentAgentId: 'agent-old',
            currentBranchId: 'branch-1',
            leadId: 'lead-1',
            reason: 'routing_rule',
            targetAgentId: 'agent-2',
            targetBranchId: 'branch-1',
          },
        }
      );
      answers.push(yield cursorAdvance);
      answers.push(
        yield {
          operation: 'appendRoutingAssignmentAudit',
          params: {
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
          },
        }
      );
      answers.push(yield { operation: 'appendOutboxEvent', params: { event: {} } });
      return routed;
    });

    await expect(coordinator(outbox)(input)).resolves.toMatchObject({ outcome: 'routed' });

    expect(planMock).toHaveBeenCalledWith(input, { outboxEventId: expect.any(Function) });
    expect(fake.transactionIds).toEqual(['tx-1']);
    expect(fake.writeTables).toEqual([
      crmLeads,
      crmLeadOwnershipHistory,
      crmLeadOwnershipHistory,
      crmRoutingCursors,
      crmRoutingAssignmentsAudit,
    ]);
    expect(fake.committedWriteTables).toEqual(fake.writeTables);
    expect(outboxTransactionIds).toEqual(['tx-1']);
    expect(answers[0]).toBe(true);
    expect(answers[1]).toMatchObject({ success: true });
    expect(answers[2]).toMatchObject({ status: 'appended' });
    expect(answers[3]).toEqual({ outboxEvent, status: 'enqueued' });
  });

  it('rolls back transaction writes when the plan raises a typed rollback', async () => {
    const fake = createFakeDatabase();
    planMock.mockImplementation(function* () {
      yield cursorAdvance;
      throw new CrmRoutingApplicationRollback({
        outcome: 'stale_lead',
        reason: 'concurrent_owner_change',
      });
    });

    await expect(coordinator()(input)).resolves.toEqual({
      outcome: 'stale_lead',
      reason: 'concurrent_owner_change',
    });

    expect(fake.writeTables).toEqual([crmRoutingCursors]);
    expect(fake.committedWriteTables).toEqual([]);
  });

  it('rolls back and reports repository_failure when the outbox append fails', async () => {
    const fake = createFakeDatabase();
    const outbox = { appendEvent: vi.fn(async () => Promise.reject(new Error('outbox down'))) };
    planMock.mockImplementation(function* () {
      yield cursorAdvance;
      yield { operation: 'appendOutboxEvent', params: { event: {} } };
      return routed;
    });

    await expect(coordinator(outbox)(input)).resolves.toEqual({ outcome: 'repository_failure' });

    expect(outbox.appendEvent).toHaveBeenCalledOnce();
    expect(fake.writeTables).toEqual([crmRoutingCursors]);
    expect(fake.committedWriteTables).toEqual([]);
  });

  it('maps unexpected plan failures to repository_failure', async () => {
    const fake = createFakeDatabase();
    planMock.mockImplementation(function* () {
      yield cursorAdvance;
      throw new Error('db unavailable');
    });

    await expect(coordinator()(input)).resolves.toEqual({ outcome: 'repository_failure' });
    expect(fake.committedWriteTables).toEqual([]);
  });
});
