import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type {
  CrmRoutingAssignmentAuditRecord,
  CrmRoutingCursorAdvancement,
} from '@interdomestik/domain-crm/routing';
import {
  createAdminCrmRoutingRuleRepository,
  createCrmRoutingRepository,
} from './routing-repository';

const hoisted = vi.hoisted(() => ({
  db: {},
}));

vi.mock('@interdomestik/database/db', () => ({
  db: hoisted.db,
}));

export type AdminRoutingDb = NonNullable<Parameters<typeof createAdminCrmRoutingRuleRepository>[1]>;
export type RoutingRepositoryDb = NonNullable<Parameters<typeof createCrmRoutingRepository>[1]>;

export const now = new Date('2026-05-16T08:00:00.000Z');

export function routingRepositoryDb(database: unknown): RoutingRepositoryDb {
  return database as RoutingRepositoryDb;
}

export const branchManager: CrmActorContext = {
  actorId: 'manager-1',
  role: 'branch_manager',
  scope: { branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

export const adminActor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: { branchId: null },
  tenantId: 'tenant-1',
};

export const advancement: CrmRoutingCursorAdvancement = {
  agentId: 'agent-2',
  nextCursor: 'agent-2',
  priorCursor: 'agent-1',
  ruleId: 'rule-1',
  tenantId: 'tenant-1',
};

export const auditRecord: CrmRoutingAssignmentAuditRecord = {
  actorId: 'manager-1',
  agentId: 'agent-2',
  branchId: 'branch-1',
  idempotencyKey: 'route:lead-1',
  leadId: 'lead-1',
  occurredAt: now.toISOString(),
  reasonCode: 'rule_match',
  ruleId: 'rule-1',
  strategy: 'round_robin',
  tenantId: 'tenant-1',
};

export function routingRuleRow(overrides: Record<string, unknown> = {}) {
  return {
    agentPool: ['agent-1', 'agent-2'],
    archivedAt: null,
    branchId: 'branch-1',
    createdAt: now,
    effectiveFrom: new Date('2026-05-16T00:00:00.000Z'),
    effectiveTo: null,
    enabled: true,
    fallbackAgentId: null,
    fallbackRuleId: null,
    id: 'rule-1',
    leadType: 'business',
    maxNewLeadsPerAgentPerDay: 3,
    maxOpenLeadsPerAgent: 8,
    priority: 10,
    source: 'website',
    strategy: 'round_robin',
    tenantId: 'tenant-1',
    updatedAt: now,
    utmCampaign: 'spring',
    utmMedium: 'cpc',
    utmSource: 'google',
    ...overrides,
  };
}

export function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    actorId: auditRecord.actorId,
    branchId: auditRecord.branchId,
    createdAt: now,
    id: 'audit-1',
    idempotencyKey: auditRecord.idempotencyKey,
    leadId: auditRecord.leadId,
    occurredAt: now,
    reasonCode: auditRecord.reasonCode,
    ruleId: auditRecord.ruleId,
    selectedAgentId: auditRecord.agentId,
    strategy: auditRecord.strategy,
    tenantId: auditRecord.tenantId,
    ...overrides,
  };
}

export function createAdminRepositoryForTest(fakeDb: unknown) {
  return createAdminCrmRoutingRuleRepository(
    mintTestTenantAuthority('tenant-1'),
    fakeDb as AdminRoutingDb
  );
}

export function createUpdateDb(rows: readonly unknown[], existingCursor: unknown = null) {
  const calls: unknown[] = [];
  const findFirst = vi.fn(async () => existingCursor);
  return {
    calls,
    findFirst,
    db: {
      query: {
        crmRoutingAssignmentsAudit: { findFirst: vi.fn() },
        crmRoutingCursors: { findFirst },
        crmRoutingRules: { findMany: vi.fn() },
      },
      update(table: unknown) {
        calls.push({ action: 'update', table });
        return {
          set(values: unknown) {
            calls.push({ action: 'set', values });
            return {
              where(where: unknown) {
                calls.push({ action: 'where', where });
                return { returning: vi.fn(async () => rows) };
              },
            };
          },
        };
      },
    },
  };
}

export { hoisted };
