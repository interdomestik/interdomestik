import { describe, expect, it, vi } from 'vitest';
import {
  TEST_AUTHORITY,
  adminActor,
  adminSession,
  baseInput,
  repository,
  rule,
} from './_routing-core.test-support';
import { getAdminCrmRoutingRulesCore, runAdminCrmRoutingRuleAction } from './_routing-core';
import type { AdminCrmRoutingActionErrorReason } from './_routing-types';

describe('getAdminCrmRoutingRulesCore', () => {
  it('projects routing rules into aggregate PII-free admin summaries', async () => {
    const repo = repository({
      listRoutingRulesForAdmin: vi.fn(async () => [
        rule({ branchId: 'branch-1', fallbackAgentId: 'agent-1', priority: 4 }),
      ]),
    });

    await expect(
      getAdminCrmRoutingRulesCore(
        { actor: adminActor, authority: TEST_AUTHORITY },
        { repository: repo }
      )
    ).resolves.toEqual({
      counts: { active: 1, archived: 0 },
      rules: [
        expect.objectContaining({
          agentPoolCount: 2,
          archived: false,
          fallback: { agentId: 'agent-1', ruleId: null },
          filters: expect.objectContaining({ source: 'website' }),
          priority: 4,
          scope: { branchId: 'branch-1', branchLabel: 'North', kind: 'branch' },
        }),
      ],
    });
  });

  it('counts only enabled non-archived rules as active', async () => {
    const repo = repository({
      listRoutingRulesForAdmin: vi.fn(async () => [
        rule({ enabled: true, id: 'active-rule' }),
        rule({ enabled: false, id: 'disabled-rule' }),
        rule({ archivedAt: '2026-05-16T09:00:00.000Z', id: 'archived-rule' }),
      ]),
    });

    await expect(
      getAdminCrmRoutingRulesCore(
        { actor: adminActor, authority: TEST_AUTHORITY },
        { repository: repo }
      )
    ).resolves.toEqual(expect.objectContaining({ counts: { active: 1, archived: 1 } }));
  });

  it('rejects branch-manager actors before listing routing rules', async () => {
    const repo = repository();
    await expect(
      getAdminCrmRoutingRulesCore(
        {
          actor: {
            actorId: 'manager-1',
            role: 'branch_manager',
            scope: { branchId: 'branch-1' },
            tenantId: 'tenant-1',
          },
          authority: TEST_AUTHORITY,
        },
        { repository: repo }
      )
    ).rejects.toThrow('Admin CRM routing access denied');
    expect(repo.listRoutingRulesForAdmin).not.toHaveBeenCalled();
  });
});

describe('runAdminCrmRoutingRuleAction', () => {
  it('refuses to act without a tenant authority, before parsing or repository access', async () => {
    const repo = repository();
    await expect(
      runAdminCrmRoutingRuleAction(
        { authority: null, input: baseInput, kind: 'create', session: adminSession },
        { repository: repo }
      )
    ).resolves.toEqual({ reason: 'forbidden', status: 'error' });
    expect(repo.createRoutingRule).not.toHaveBeenCalled();
  });

  it('authorizes before parsing or repository access', async () => {
    const repo = repository();
    await expect(
      runAdminCrmRoutingRuleAction(
        {
          authority: TEST_AUTHORITY,
          input: { unknown: Symbol('unparseable') },
          kind: 'create',
          session: { user: { id: 'manager-1', role: 'branch_manager', tenantId: 'tenant-1' } },
        },
        { repository: repo }
      )
    ).resolves.toEqual({ reason: 'forbidden', status: 'error' });
    expect(repo.createRoutingRule).not.toHaveBeenCalled();
  });

  it('creates a routing rule after strict validation', async () => {
    const repo = repository();
    await expect(
      runAdminCrmRoutingRuleAction(
        { authority: TEST_AUTHORITY, input: baseInput, kind: 'create', session: adminSession },
        { repository: repo }
      )
    ).resolves.toEqual({ ruleId: 'rule-1', status: 'ok' });
    expect(repo.createRoutingRule).toHaveBeenCalledWith({
      actor: adminActor,
      input: baseInput,
    });
  });

  it.each([
    ['empty_agent_pool', { ...baseInput, agentIds: [] }],
    ['duplicate_agent_id', { ...baseInput, agentIds: ['agent-1', 'agent-1'] }],
    ['invalid_window', { ...baseInput, effectiveFrom: '2026-05-17', effectiveTo: '2026-05-16' }],
    ['invalid_window', { ...baseInput, effectiveFrom: 'not-a-date' }],
    ['invalid_priority_or_cap', { ...baseInput, priority: -1 }],
    ['unknown_field', { ...baseInput, extra: true }],
  ] satisfies Array<[AdminCrmRoutingActionErrorReason, Record<string, unknown>]>)(
    'returns %s for invalid action input',
    async (reason, input) => {
      const repo = repository();
      await expect(
        runAdminCrmRoutingRuleAction(
          { authority: TEST_AUTHORITY, input, kind: 'create', session: adminSession },
          { repository: repo }
        )
      ).resolves.toEqual(expect.objectContaining({ reason, status: 'error' }));
      expect(repo.createRoutingRule).not.toHaveBeenCalled();
    }
  );

  it('rejects cross-tenant or non-agent IDs before writing', async () => {
    const repo = repository({
      listAgentScopes: vi.fn(async () => [
        { branchId: null, id: 'agent-1', role: 'staff', tenantId: 'tenant-1' },
      ]),
    });

    await expect(
      runAdminCrmRoutingRuleAction(
        { authority: TEST_AUTHORITY, input: baseInput, kind: 'create', session: adminSession },
        { repository: repo }
      )
    ).resolves.toEqual({ field: 'agentIds', reason: 'cross_tenant_agent', status: 'error' });
    expect(repo.createRoutingRule).not.toHaveBeenCalled();
  });

  it('rejects archived fallback rules', async () => {
    const repo = repository({
      getRoutingRule: vi.fn(async () =>
        rule({ archivedAt: '2026-05-16T09:00:00.000Z', id: 'fallback-1' })
      ),
    });

    await expect(
      runAdminCrmRoutingRuleAction(
        {
          authority: TEST_AUTHORITY,
          input: { ...baseInput, fallbackRuleId: 'fallback-1' },
          kind: 'create',
          session: adminSession,
        },
        { repository: repo }
      )
    ).resolves.toEqual({ field: 'fallbackRuleId', reason: 'archived_fallback', status: 'error' });
  });

  it('rejects disabled fallback rules', async () => {
    const repo = repository({
      getRoutingRule: vi.fn(async () => rule({ enabled: false, id: 'fallback-1' })),
    });

    await expect(
      runAdminCrmRoutingRuleAction(
        {
          authority: TEST_AUTHORITY,
          input: { ...baseInput, fallbackRuleId: 'fallback-1' },
          kind: 'create',
          session: adminSession,
        },
        { repository: repo }
      )
    ).resolves.toEqual({ field: 'fallbackRuleId', reason: 'disabled_fallback', status: 'error' });
  });
});
