import { vi } from 'vitest';
import type { CrmOutboxEvent } from '@interdomestik/domain-crm/outbox';
import {
  crmLeadOwnershipHistory,
  crmLeads,
  crmRoutingAssignmentsAudit,
  crmRoutingCursors,
} from '@interdomestik/database/schema';

const hoisted = vi.hoisted(() => ({
  database: undefined as
    undefined | { transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> },
  planMock: vi.fn(),
}));

vi.mock('@interdomestik/domain-crm/routing', async importActual => {
  const actual = await importActual<typeof import('@interdomestik/domain-crm/routing')>();
  return {
    ...actual,
    planCrmLeadRoutingDecision: hoisted.planMock,
  };
});

// withTenantAuthority reaches withTenantContext through the package root: open the fake's
// transaction there.
vi.mock('@interdomestik/database', () => ({
  withTenantContext: vi.fn(async (_context: unknown, action: (tx: unknown) => Promise<unknown>) => {
    if (!hoisted.database) throw new Error('no fake tenant database');
    return hoisted.database.transaction(action);
  }),
}));

const planMock = hoisted.planMock;

export const actor = {
  actorId: 'manager-1',
  role: 'branch_manager' as const,
  scope: { branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

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

export function leadRow(overrides: Record<string, unknown> = {}) {
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

export function auditRow() {
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

export function auditRows() {
  return Promise.resolve([auditRow()]);
}

export function createInsertValues(table: unknown) {
  if (table === crmRoutingAssignmentsAudit) {
    return {
      onConflictDoNothing() {
        return { returning: vi.fn(auditRows) };
      },
    };
  }
  return Promise.resolve([]);
}

export function groupedRows(selection: unknown, table: unknown) {
  if (table === crmLeads) return Promise.resolve([{ agentId: 'agent-2', count: 4 }]);
  if (selection && table === crmLeadOwnershipHistory) {
    return Promise.resolve([{ agentId: 'agent-2', count: 1 }]);
  }
  return Promise.resolve([{ agentId: 'agent-2', count: 2 }]);
}

export function createSelectQuery(selection: unknown) {
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

export function updatedRows(table: unknown) {
  if (table === crmLeads) return Promise.resolve([leadRow({ agentId: 'agent-2' })]);
  if (table === crmLeadOwnershipHistory) return Promise.resolve([{ id: 'ownership-history-1' }]);
  if (table === crmRoutingCursors) return Promise.resolve([{ ruleId: 'rule-1' }]);
  return Promise.resolve([]);
}

export function createUpdateQuery(table: unknown) {
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
      branches: { findFirst: vi.fn(() => Promise.resolve({ id: 'branch-1' })) },
      crmRoutingAssignmentsAudit: { findFirst: vi.fn(() => Promise.resolve(null)) },
      crmRoutingCursors: { findMany: vi.fn(() => Promise.resolve([])) },
      crmRoutingRules: { findMany: vi.fn(() => Promise.resolve([])) },
      crmLeads: { findFirst: vi.fn(() => Promise.resolve(leadRow())) },
      crmActivities: { findMany: vi.fn(() => Promise.resolve([])) },
      crmLeadOwnershipHistory: { findMany: vi.fn(() => Promise.resolve([])) },
      user: { findFirst: vi.fn(() => Promise.resolve({ id: 'agent-2' })) },
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

  hoisted.database = database;
  return {
    activeTransactionId: () => activeTransactionId,
    committedWriteTables,
    database,
    transactionIds,
    writeTables,
  };
}

export { planMock };
