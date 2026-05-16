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

import {
  createAdminCrmRoutingRuleRepository,
  createCrmRoutingRepository,
} from './routing-repository';

type AdminRoutingDb = Parameters<typeof createAdminCrmRoutingRuleRepository>[0];

const now = new Date('2026-05-16T08:00:00.000Z');

const branchManager: CrmActorContext = {
  actorId: 'manager-1',
  role: 'branch_manager',
  scope: { branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

const adminActor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: { branchId: null },
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

function createAdminRepositoryForTest(fakeDb: unknown) {
  return createAdminCrmRoutingRuleRepository(fakeDb as AdminRoutingDb);
}

function createUpdateDb(rows: readonly unknown[], existingCursor: unknown = null) {
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

  it('creates the first routing cursor with a tenant-scoped insert when no prior cursor exists', async () => {
    const firstAdvancement = { ...advancement, priorCursor: null };
    const calls: unknown[] = [];
    const fakeDb = {
      insert(table: unknown) {
        calls.push({ action: 'insert', table });
        return {
          values(values: unknown) {
            calls.push({ action: 'values', values });
            return {
              onConflictDoNothing(options: unknown) {
                calls.push({ action: 'onConflictDoNothing', options });
                return {
                  returning: vi.fn(async () => [
                    {
                      cursorValue: firstAdvancement.nextCursor,
                      lastIdempotencyKey: 'route:lead-1',
                      ruleId: firstAdvancement.ruleId,
                      tenantId: firstAdvancement.tenantId,
                      updatedAt: now,
                    },
                  ]),
                };
              },
            };
          },
        };
      },
      query: {
        crmRoutingAssignmentsAudit: { findFirst: vi.fn() },
        crmRoutingCursors: { findFirst: vi.fn() },
        crmRoutingRules: { findMany: vi.fn() },
      },
      update: vi.fn(),
    };
    const repository = createCrmRoutingRepository(fakeDb as never);

    await expect(
      repository.advanceRoutingCursor({
        advancement: firstAdvancement,
        idempotencyKey: 'route:lead-1',
      })
    ).resolves.toEqual({ success: true, advancement: firstAdvancement });

    expect(calls).toEqual([
      { action: 'insert', table: crmRoutingCursors },
      expect.objectContaining({
        action: 'values',
        values: expect.objectContaining({
          cursorValue: firstAdvancement.nextCursor,
          ruleId: firstAdvancement.ruleId,
          tenantId: firstAdvancement.tenantId,
        }),
      }),
      expect.objectContaining({
        action: 'onConflictDoNothing',
        options: expect.objectContaining({
          target: [crmRoutingCursors.tenantId, crmRoutingCursors.ruleId],
        }),
      }),
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

  it('treats a cursor write retried with the same idempotency key as successful', async () => {
    const fake = createUpdateDb([], {
      cursorValue: advancement.nextCursor,
      lastIdempotencyKey: 'route:lead-1',
      ruleId: advancement.ruleId,
      tenantId: advancement.tenantId,
      updatedAt: now,
    });
    const repository = createCrmRoutingRepository(fake.db as never);

    await expect(
      repository.advanceRoutingCursor({ advancement, idempotencyKey: 'route:lead-1' })
    ).resolves.toEqual({ success: true, advancement });

    expect(fake.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
      })
    );
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
    ).resolves.toEqual({ auditRecord, status: 'existing' });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
      })
    );
    expect(insert).toHaveBeenCalledWith(crmRoutingAssignmentsAudit);
  });

  it('reads assignment audit replay rows by tenant and idempotency key', async () => {
    const findFirst = vi.fn(async () => auditRow());
    const fakeDb = {
      query: {
        crmRoutingAssignmentsAudit: { findFirst },
        crmRoutingRules: { findMany: vi.fn() },
      },
    };
    const repository = createCrmRoutingRepository(fakeDb as never);

    await expect(
      repository.findRoutingAssignmentAuditByIdempotency({
        idempotencyKey: 'route:lead-1',
        tenantId: 'tenant-1',
      })
    ).resolves.toEqual(auditRecord);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
      })
    );
  });

  it('creates admin routing rules with the session tenant and domain agentIds vocabulary', async () => {
    const calls: unknown[] = [];
    const fakeDb = {
      insert(table: unknown) {
        calls.push({ action: 'insert', table });
        return {
          values(values: unknown) {
            calls.push({ action: 'values', values });
            return {
              returning: vi.fn(async () => [
                routingRuleRow({
                  agentPool: ['agent-1'],
                  branchId: null,
                  priority: 0,
                  tenantId: 'tenant-1',
                }),
              ]),
            };
          },
        };
      },
      query: {
        branches: { findMany: vi.fn() },
        crmRoutingRules: { findFirst: vi.fn(), findMany: vi.fn() },
        user: { findMany: vi.fn() },
      },
    };
    const repository = createAdminRepositoryForTest(fakeDb);

    await expect(
      repository.createRoutingRule({
        actor: adminActor,
        input: {
          agentIds: ['agent-1'],
          branchId: null,
          effectiveFrom: null,
          effectiveTo: null,
          fallbackAgentId: null,
          fallbackRuleId: null,
          leadType: null,
          maxNewLeadsPerAgentPerDay: null,
          maxOpenLeadsPerAgent: null,
          priority: 0,
          source: null,
          strategy: 'manual_only',
          utmCampaign: null,
          utmMedium: null,
          utmSource: null,
        },
      })
    ).resolves.toEqual(
      expect.objectContaining({
        agentIds: ['agent-1'],
        tenantId: 'tenant-1',
      })
    );

    expect(calls).toEqual([
      { action: 'insert', table: crmRoutingRules },
      expect.objectContaining({
        action: 'values',
        values: expect.objectContaining({
          agentPool: ['agent-1'],
          tenantId: 'tenant-1',
        }),
      }),
    ]);
  });

  it('normalizes routing rule priorities in a transaction during reorder', async () => {
    const updatedRows = [
      routingRuleRow({ id: 'rule-2', priority: 0 }),
      routingRuleRow({ id: 'rule-1', priority: 1 }),
    ];
    const updates: unknown[] = [];
    const tx = {
      query: {
        crmRoutingRules: {
          findMany: vi.fn(async () => [
            routingRuleRow({ id: 'rule-1', priority: 0 }),
            routingRuleRow({ id: 'rule-2', priority: 1 }),
          ]),
        },
      },
      update(table: unknown) {
        updates.push({ action: 'update', table });
        return {
          set(values: unknown) {
            updates.push({ action: 'set', values });
            return {
              where(where: unknown) {
                updates.push({ action: 'where', where });
                return { returning: vi.fn(async () => [updatedRows.shift()]) };
              },
            };
          },
        };
      },
    };
    const fakeDb = {
      transaction: vi.fn(async callback => callback(tx)),
    };
    const repository = createAdminRepositoryForTest(fakeDb);

    await expect(
      repository.reorderRoutingRules({
        actor: adminActor,
        branchId: null,
        ruleIds: ['rule-2', 'rule-1'],
      })
    ).resolves.toEqual([
      expect.objectContaining({ id: 'rule-2', priority: 0 }),
      expect.objectContaining({ id: 'rule-1', priority: 1 }),
    ]);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(updates.filter(call => (call as { action: string }).action === 'set')).toEqual([
      expect.objectContaining({ values: expect.objectContaining({ priority: 0 }) }),
      expect.objectContaining({ values: expect.objectContaining({ priority: 1 }) }),
    ]);
  });

  it('rejects stale reorder lists before writing priorities', async () => {
    const updates: unknown[] = [];
    const tx = {
      query: {
        crmRoutingRules: {
          findMany: vi.fn(async () => [
            routingRuleRow({ id: 'rule-1', priority: 0 }),
            routingRuleRow({ id: 'rule-2', priority: 1 }),
          ]),
        },
      },
      update(table: unknown) {
        updates.push({ action: 'update', table });
        return {
          set(values: unknown) {
            updates.push({ action: 'set', values });
            return {
              where(where: unknown) {
                updates.push({ action: 'where', where });
                return { returning: vi.fn(async () => []) };
              },
            };
          },
        };
      },
    };
    const fakeDb = {
      transaction: vi.fn(async callback => callback(tx)),
    };
    const repository = createAdminRepositoryForTest(fakeDb);

    await expect(
      repository.reorderRoutingRules({
        actor: adminActor,
        branchId: null,
        ruleIds: ['rule-2'],
      })
    ).resolves.toEqual([]);

    expect(updates).toEqual([]);
  });

  it('rolls back reorder transactions when a validated row disappears mid-update', async () => {
    const tx = {
      query: {
        crmRoutingRules: {
          findMany: vi.fn(async () => [
            routingRuleRow({ id: 'rule-1', priority: 0 }),
            routingRuleRow({ id: 'rule-2', priority: 1 }),
          ]),
        },
      },
      update() {
        return {
          set() {
            return {
              where() {
                return { returning: vi.fn(async () => []) };
              },
            };
          },
        };
      },
    };
    const fakeDb = {
      transaction: vi.fn(async callback => callback(tx)),
    };
    const repository = createAdminRepositoryForTest(fakeDb);

    await expect(
      repository.reorderRoutingRules({
        actor: adminActor,
        branchId: null,
        ruleIds: ['rule-2', 'rule-1'],
      })
    ).rejects.toThrow('CRM routing reorder failed during priority update');
  });

  it('exposes routing tables through database schema exports for migration-backed adapters', () => {
    expect(crmRoutingRules).toBeDefined();
    expect(crmRoutingCursors).toBeDefined();
    expect(crmRoutingAssignmentsAudit).toBeDefined();
  });
});
