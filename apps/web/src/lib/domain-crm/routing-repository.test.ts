import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  db: {},
}));

vi.mock('@interdomestik/database/db', () => ({
  db: hoisted.db,
}));

import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type {
  CrmRoutingAssignmentAuditRecord,
  CrmRoutingCursorAdvancement,
} from '@interdomestik/domain-crm/routing';

import {
  crmRoutingAssignmentsAudit,
  crmRoutingCursors,
  crmRoutingRules,
} from '@interdomestik/database/schema';

import { createCrmRoutingRepository } from './routing-repository';

const now = new Date('2026-05-16T08:00:00.000Z');

const branchManager: CrmActorContext = {
  actorId: 'manager-1',
  role: 'branch_manager',
  scope: { branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

const advancement: CrmRoutingCursorAdvancement = {
  agentId: 'agent-2',
  nextCursor: 'agent-2',
  priorCursor: 'agent-1',
  ruleId: 'rule-1',
  tenantId: 'tenant-1',
};

const auditRecord: CrmRoutingAssignmentAuditRecord = {
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

function routingRuleRow(overrides: Record<string, unknown> = {}) {
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

function auditRow(overrides: Record<string, unknown> = {}) {
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

function createUpdateDb(rows: readonly unknown[]) {
  const calls: unknown[] = [];
  return {
    calls,
    db: {
      query: {
        crmRoutingAssignmentsAudit: { findFirst: vi.fn() },
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

describe('crmRoutingRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists active tenant routing rules and maps persisted rule rows to CRM07 rules', async () => {
    const findMany = vi.fn(async () => [routingRuleRow()]);
    const fakeDb = {
      query: {
        crmRoutingAssignmentsAudit: { findFirst: vi.fn() },
        crmRoutingRules: { findMany },
      },
      update: vi.fn(),
    };
    const repository = createCrmRoutingRepository(fakeDb as never);

    await expect(repository.listRoutingRules({ actor: branchManager })).resolves.toEqual([
      {
        agentIds: ['agent-1', 'agent-2'],
        branchId: 'branch-1',
        effectiveFrom: '2026-05-16T00:00:00.000Z',
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
        utmCampaign: 'spring',
        utmMedium: 'cpc',
        utmSource: 'google',
      },
    ]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.any(Array),
        where: expect.anything(),
      })
    );
  });

  it('advances routing cursors with a tenant-scoped compare-and-swap update', async () => {
    const fake = createUpdateDb([
      {
        cursorValue: advancement.nextCursor,
        lastIdempotencyKey: 'route:lead-1',
        ruleId: advancement.ruleId,
        tenantId: advancement.tenantId,
        updatedAt: now,
      },
    ]);
    const repository = createCrmRoutingRepository(fake.db as never);

    await expect(
      repository.advanceRoutingCursor({ advancement, idempotencyKey: 'route:lead-1' })
    ).resolves.toEqual({ success: true, advancement });

    expect(fake.calls).toEqual([
      { action: 'update', table: crmRoutingCursors },
      expect.objectContaining({
        action: 'set',
        values: expect.objectContaining({
          cursorValue: advancement.nextCursor,
          lastIdempotencyKey: 'route:lead-1',
        }),
      }),
      expect.objectContaining({ action: 'where' }),
    ]);
  });

  it('returns cursor_conflict when the compare-and-swap update finds no cursor row', async () => {
    const fake = createUpdateDb([]);
    const repository = createCrmRoutingRepository(fake.db as never);

    await expect(repository.advanceRoutingCursor({ advancement })).resolves.toEqual({
      reason: 'cursor_conflict',
      success: false,
    });
  });

  it('returns the existing assignment audit row when idempotent append already exists', async () => {
    const insert = vi.fn((table: unknown) => {
      expect(table).toBe(crmRoutingAssignmentsAudit);
      return {
        values(values: unknown) {
          return {
            onConflictDoNothing(options: unknown) {
              return {
                returning: vi.fn(async () => {
                  expect(values).toEqual(
                    expect.objectContaining({
                      actorId: auditRecord.actorId,
                      idempotencyKey: auditRecord.idempotencyKey,
                      selectedAgentId: auditRecord.agentId,
                      tenantId: auditRecord.tenantId,
                    })
                  );
                  expect(options).toEqual(
                    expect.objectContaining({
                      target: [
                        crmRoutingAssignmentsAudit.tenantId,
                        crmRoutingAssignmentsAudit.idempotencyKey,
                      ],
                    })
                  );
                  return [];
                }),
              };
            },
          };
        },
      };
    });
    const findFirst = vi.fn(async () => auditRow());
    const fakeDb = {
      insert,
      query: {
        crmRoutingAssignmentsAudit: { findFirst },
        crmRoutingRules: { findMany: vi.fn() },
      },
      update: vi.fn(),
    };
    const repository = createCrmRoutingRepository(fakeDb as never);

    await expect(
      repository.appendRoutingAssignmentAudit({
        auditRecord,
        idempotencyKey: auditRecord.idempotencyKey,
      })
    ).resolves.toEqual(auditRecord);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
      })
    );
    expect(insert).toHaveBeenCalledWith(crmRoutingAssignmentsAudit);
  });

  it('exposes routing tables through database schema exports for migration-backed adapters', () => {
    expect(crmRoutingRules).toBeDefined();
    expect(crmRoutingCursors).toBeDefined();
    expect(crmRoutingAssignmentsAudit).toBeDefined();
  });
});
