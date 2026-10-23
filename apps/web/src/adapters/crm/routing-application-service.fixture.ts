import { vi } from 'vitest';
import {
  crmLeadOwnershipHistory,
  crmLeads,
  crmRoutingAssignmentsAudit,
  crmRoutingCursors,
} from '@interdomestik/database/schema';
import type { CrmOutboxEvent } from '@interdomestik/domain-crm/outbox';

export const outboxEvent: CrmOutboxEvent = {
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

async function auditRows() {
  return [auditRow()];
}

function createInsertValues(table: unknown) {
  if (table === crmRoutingAssignmentsAudit) {
    return {
      onConflictDoNothing() {
        return { returning: vi.fn(auditRows) };
      },
    };
  }
  return Promise.resolve([]);
}

async function groupedRows(selection: unknown, table: unknown) {
  if (table === crmLeads) return [{ agentId: 'agent-2', count: 4 }];
  if (selection && table === crmLeadOwnershipHistory) {
    return [{ agentId: 'agent-2', count: 1 }];
  }
  return [{ agentId: 'agent-2', count: 2 }];
}

function createSelectQuery(selection: unknown) {
  return {
    from(table: unknown) {
      return {
        where() {
          return {
            groupBy: vi.fn(() => groupedRows(selection, table)),
          };
        },
      };
    },
  };
}

async function updatedRows(table: unknown) {
  if (table === crmLeads) return [leadRow({ agentId: 'agent-2' })];
  if (table === crmLeadOwnershipHistory) return [{ id: 'ownership-history-1' }];
  if (table === crmRoutingCursors) return [{ ruleId: 'rule-1' }];
  return [];
}

function createUpdateQuery(table: unknown) {
  return {
    set() {
      return {
        where() {
          return {
            returning: vi.fn(() => updatedRows(table)),
          };
        },
      };
    },
  };
}

export function createFakeDatabase() {
  const writeTables: unknown[] = [];
  const committedWriteTables: unknown[] = [];
  const transactionIds: string[] = [];
  let activeTransactionId: string | null = null;

  const tx = {
    insert(table: unknown) {
      writeTables.push(table);
      return {
        values: () => createInsertValues(table),
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
    select: vi.fn(createSelectQuery),
    update(table: unknown) {
      writeTables.push(table);
      return createUpdateQuery(table);
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
