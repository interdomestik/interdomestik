import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CrmRoutingApplicationRollback,
  type ApplyCrmLeadRoutingDecisionResult,
} from '@interdomestik/domain-crm/routing';
import type { CrmOutboxEvent } from '@interdomestik/domain-crm/outbox';
import {
  crmLeadOwnershipHistory,
  crmLeads,
  crmRoutingAssignmentsAudit,
  crmRoutingCursors,
} from '@interdomestik/database/schema';

const applyMock = vi.hoisted(() => vi.fn());

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

const outboxEvent: CrmOutboxEvent = {
  aggregateId: 'lead-1',
  aggregateType: 'lead',
  availableAt: '2026-05-16T10:00:00.000Z',
  createdAt: '2026-05-16T10:00:00.000Z',
  event: {
    aggregateId: 'lead-1',
    aggregateType: 'lead',
    occurredAt: '2026-05-16T10:00:00.000Z',
    payload: {
      agentId: 'agent-2',
      leadId: 'lead-1',
      reasonCode: 'rule_match',
      ruleId: 'rule-1',
      strategy: 'round_robin',
    },
    tenantId: 'tenant-1',
    type: 'crm.lead.routed',
  },
  id: 'outbox-1',
  idempotencyKey: 'route:lead-1',
  retryCount: 0,
  status: 'pending',
  tenantId: 'tenant-1',
  type: 'crm.lead.routed',
};

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    agentId: 'agent-old',
    branchId: 'branch-1',
    companyName: null,
    createdAt: new Date('2026-05-16T09:00:00.000Z'),
    email: null,
    fullName: null,
    id: 'lead-1',
    lastContactedAt: null,
    lostAt: null,
    notes: null,
    phone: null,
    score: 0,
    source: 'website',
    stage: 'qualified',
    tenantId: 'tenant-1',
    type: 'business',
    updatedAt: new Date('2026-05-16T09:00:00.000Z'),
    utmCampaign: null,
    utmContent: null,
    utmMedium: null,
    utmSource: null,
    wonAt: null,
    ...overrides,
  };
}

function auditRow() {
  return {
    actorId: 'manager-1',
    branchId: 'branch-1',
    createdAt: new Date('2026-05-16T10:00:00.000Z'),
    id: 'audit-1',
    idempotencyKey: 'route:lead-1',
    leadId: 'lead-1',
    metadata: null,
    occurredAt: new Date('2026-05-16T10:00:00.000Z'),
    reasonCode: 'rule_match',
    ruleId: 'rule-1',
    selectedAgentId: 'agent-2',
    strategy: 'round_robin',
    tenantId: 'tenant-1',
  };
}

function createFakeDatabase() {
  const writeTables: unknown[] = [];
  const committedWriteTables: unknown[] = [];
  const transactionIds: string[] = [];
  let activeTransactionId: string | null = null;

  const tx = {
    insert(table: unknown) {
      writeTables.push(table);
      return {
        values() {
          if (table === crmRoutingAssignmentsAudit) {
            return {
              onConflictDoNothing() {
                return { returning: vi.fn(async () => [auditRow()]) };
              },
            };
          }
          return Promise.resolve([]);
        },
      };
    },
    query: {
      branches: { findFirst: vi.fn(async () => ({ id: 'branch-1' })) },
      crmRoutingAssignmentsAudit: { findFirst: vi.fn(async () => null) },
      crmRoutingCursors: { findMany: vi.fn(async () => []) },
      crmRoutingRules: { findMany: vi.fn(async () => []) },
      crmLeads: { findFirst: vi.fn(async () => leadRow()) },
      crmActivities: { findMany: vi.fn(async () => []) },
      crmLeadOwnershipHistory: { findMany: vi.fn(async () => []) },
      user: { findFirst: vi.fn(async () => ({ id: 'agent-2' })) },
    },
    select: vi.fn((selection: unknown) => ({
      from(table: unknown) {
        return {
          where() {
            return {
              groupBy: vi.fn(async () => {
                if (table === crmLeads) return [{ agentId: 'agent-2', count: 4 }];
                if (selection && table === crmLeadOwnershipHistory) {
                  return [{ agentId: 'agent-2', count: 1 }];
                }
                return [{ agentId: 'agent-2', count: 2 }];
              }),
            };
          },
        };
      },
    })),
    update(table: unknown) {
      writeTables.push(table);
      return {
        set() {
          return {
            where() {
              return {
                returning: vi.fn(async () => {
                  if (table === crmLeads) return [leadRow({ agentId: 'agent-2' })];
                  if (table === crmLeadOwnershipHistory) return [{ id: 'ownership-history-1' }];
                  if (table === crmRoutingCursors) return [{ ruleId: 'rule-1' }];
                  return [];
                }),
              };
            },
          };
        },
      };
    },
  };

  const database = {
    async transaction<T>(callback: (transaction: typeof tx) => Promise<T>) {
      activeTransactionId = 'tx-1';
      transactionIds.push(activeTransactionId);
      try {
        const result = await callback(tx);
        committedWriteTables.push(...writeTables);
        return result;
      } finally {
        activeTransactionId = null;
      }
    },
  };

  return {
    activeTransactionId: () => activeTransactionId,
    committedWriteTables,
    database,
    transactionIds,
    writeTables,
  };
}

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
      database: fake.database as never,
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
      database: fake.database as never,
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
      database: fake.database as never,
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
