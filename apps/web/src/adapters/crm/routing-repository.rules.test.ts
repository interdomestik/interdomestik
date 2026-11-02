import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminActor,
  auditRecord,
  auditRow,
  createAdminRepositoryForTest,
  routingRepositoryDb,
  routingRuleRow,
} from './routing-repository.test-support';
import {
  crmRoutingAssignmentsAudit,
  crmRoutingCursors,
  crmRoutingRules,
} from '@interdomestik/database/schema';
import { createCrmRoutingRepository } from './routing-repository';

describe('crmRoutingRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads assignment audit replay rows by tenant and idempotency key', async () => {
    const findFirst = vi.fn(async () => auditRow());
    const fakeDb = {
      query: {
        crmRoutingAssignmentsAudit: { findFirst },
        crmRoutingRules: { findMany: vi.fn() },
      },
    };
    const repository = createCrmRoutingRepository(
      mintTestTenantAuthority('tenant-1'),
      routingRepositoryDb(fakeDb)
    );

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
