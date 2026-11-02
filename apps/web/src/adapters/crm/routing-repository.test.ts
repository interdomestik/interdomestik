import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  advancement,
  auditRecord,
  auditRow,
  branchManager,
  createUpdateDb,
  now,
  routingRepositoryDb,
  routingRuleRow,
} from './routing-repository.test-support';
import { crmRoutingAssignmentsAudit, crmRoutingCursors } from '@interdomestik/database/schema';
import { createCrmRoutingRepository } from './routing-repository';

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
    const repository = createCrmRoutingRepository(
      mintTestTenantAuthority('tenant-1'),
      routingRepositoryDb(fakeDb)
    );

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
    const repository = createCrmRoutingRepository(
      mintTestTenantAuthority('tenant-1'),
      fake.db as never
    );

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
    const repository = createCrmRoutingRepository(
      mintTestTenantAuthority('tenant-1'),
      routingRepositoryDb(fakeDb)
    );

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
    const repository = createCrmRoutingRepository(
      mintTestTenantAuthority('tenant-1'),
      fake.db as never
    );

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
    const repository = createCrmRoutingRepository(
      mintTestTenantAuthority('tenant-1'),
      fake.db as never
    );

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
    const repository = createCrmRoutingRepository(
      mintTestTenantAuthority('tenant-1'),
      routingRepositoryDb(fakeDb)
    );

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
});
