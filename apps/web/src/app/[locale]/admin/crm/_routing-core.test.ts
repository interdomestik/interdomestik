import { describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import type {
  AdminCrmRoutingRuleAdminRepository,
  AdminCrmRoutingRuleRow,
} from '@/adapters/crm/routing-repository';

import {
  getAdminCrmRoutingErrorMessageKey,
  getAdminCrmRoutingRulesCore,
  runAdminCrmRoutingRuleAction,
} from './_routing-core';
import type { AdminCrmRoutingActionErrorReason } from './_routing-types';

const adminActor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: { branchId: null },
  tenantId: 'tenant-1',
};

const adminSession = {
  user: {
    branchId: null,
    id: 'admin-1',
    role: 'admin',
    tenantId: 'tenant-1',
  },
};

const baseInput = {
  agentIds: ['agent-1', 'agent-2'],
  branchId: null,
  effectiveFrom: null,
  effectiveTo: null,
  fallbackAgentId: null,
  fallbackRuleId: null,
  leadType: null,
  maxNewLeadsPerAgentPerDay: null,
  maxOpenLeadsPerAgent: null,
  priority: 0,
  source: 'website',
  strategy: 'round_robin' as const,
  utmCampaign: null,
  utmMedium: null,
  utmSource: null,
};

function rule(overrides: Partial<AdminCrmRoutingRuleRow> = {}): AdminCrmRoutingRuleRow {
  return {
    agentIds: ['agent-1', 'agent-2'],
    archivedAt: null,
    branchId: null,
    createdAt: '2026-05-16T08:00:00.000Z',
    effectiveFrom: null,
    effectiveTo: null,
    enabled: true,
    fallbackAgentId: null,
    fallbackRuleId: null,
    id: 'rule-1',
    leadType: null,
    maxNewLeadsPerAgentPerDay: null,
    maxOpenLeadsPerAgent: null,
    priority: 0,
    source: 'website',
    strategy: 'round_robin' as const,
    tenantId: 'tenant-1',
    updatedAt: '2026-05-16T08:00:00.000Z',
    utmCampaign: null,
    utmMedium: null,
    utmSource: null,
    ...overrides,
  };
}

function repository(
  overrides: Partial<AdminCrmRoutingRuleAdminRepository> = {}
): AdminCrmRoutingRuleAdminRepository {
  return {
    archiveRoutingRule: vi.fn(async () => rule()),
    createRoutingRule: vi.fn(async () => rule()),
    getRoutingRule: vi.fn(async () => rule()),
    listAgentScopes: vi.fn(async () => [
      { branchId: null, id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
      { branchId: null, id: 'agent-2', role: 'agent', tenantId: 'tenant-1' },
    ]),
    listBranches: vi.fn(async () => [{ id: 'branch-1', label: 'North', tenantId: 'tenant-1' }]),
    listRoutingRulesForAdmin: vi.fn(async () => [rule()]),
    reorderRoutingRules: vi.fn(async () => [rule()]),
    setRoutingRuleEnabled: vi.fn(async () => rule()),
    updateRoutingRule: vi.fn(async () => rule()),
    ...overrides,
  };
}

describe('getAdminCrmRoutingRulesCore', () => {
  it('projects routing rules into aggregate PII-free admin summaries', async () => {
    const repo = repository({
      listRoutingRulesForAdmin: vi.fn(async () => [
        rule({ branchId: 'branch-1', fallbackAgentId: 'agent-1', priority: 4 }),
      ]),
    });

    await expect(
      getAdminCrmRoutingRulesCore({ actor: adminActor }, { repository: repo })
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
      getAdminCrmRoutingRulesCore({ actor: adminActor }, { repository: repo })
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
        },
        { repository: repo }
      )
    ).rejects.toThrow('Admin CRM routing access denied');
    expect(repo.listRoutingRulesForAdmin).not.toHaveBeenCalled();
  });
});

describe('runAdminCrmRoutingRuleAction', () => {
  it('authorizes before parsing or repository access', async () => {
    const repo = repository();
    await expect(
      runAdminCrmRoutingRuleAction(
        {
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
        { input: baseInput, kind: 'create', session: adminSession },
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
          { input, kind: 'create', session: adminSession },
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
        { input: baseInput, kind: 'create', session: adminSession },
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
          input: { ...baseInput, fallbackRuleId: 'fallback-1' },
          kind: 'create',
          session: adminSession,
        },
        { repository: repo }
      )
    ).resolves.toEqual({ field: 'fallbackRuleId', reason: 'disabled_fallback', status: 'error' });
  });

  it('reports unknown branch scopes with a branch-specific reason', async () => {
    const repo = repository({ listBranches: vi.fn(async () => []) });

    await expect(
      runAdminCrmRoutingRuleAction(
        {
          input: {
            ...baseInput,
            agentIds: [],
            branchId: 'missing-branch',
            strategy: 'manual_only',
          },
          kind: 'create',
          session: adminSession,
        },
        { repository: repo }
      )
    ).resolves.toEqual({ field: 'branchId', reason: 'invalid_branch', status: 'error' });
  });

  it('maps cursor_conflict for optimistic update checks', async () => {
    const repo = repository({
      updateRoutingRule: vi.fn(async () => 'cursor_conflict' as const),
    });
    await expect(
      runAdminCrmRoutingRuleAction(
        {
          input: {
            ...baseInput,
            expectedUpdatedAt: '2026-05-16T08:00:00.000Z',
            ruleId: 'rule-1',
          },
          kind: 'update',
          session: adminSession,
        },
        { repository: repo }
      )
    ).resolves.toEqual({ reason: 'cursor_conflict', status: 'error' });
  });

  it('preserves existing agent pools when update omits opaque agent IDs', async () => {
    const repo = repository();
    const inputWithoutAgentIds: Record<string, unknown> = {
      ...baseInput,
      expectedUpdatedAt: '2026-05-16T08:00:00.000Z',
      ruleId: 'rule-1',
      source: 'partner',
    };
    delete inputWithoutAgentIds.agentIds;

    await expect(
      runAdminCrmRoutingRuleAction(
        {
          input: inputWithoutAgentIds,
          kind: 'update',
          session: adminSession,
        },
        { repository: repo }
      )
    ).resolves.toEqual({ ruleId: 'rule-1', status: 'ok' });
    expect(repo.updateRoutingRule).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          agentIds: ['agent-1', 'agent-2'],
          source: 'partner',
        }),
      })
    );
  });

  it('rejects forged updates against archived rules', async () => {
    const repo = repository({
      getRoutingRule: vi.fn(async () => rule({ archivedAt: '2026-05-16T09:00:00.000Z' })),
    });

    await expect(
      runAdminCrmRoutingRuleAction(
        {
          input: {
            ...baseInput,
            expectedUpdatedAt: '2026-05-16T08:00:00.000Z',
            ruleId: 'rule-1',
          },
          kind: 'update',
          session: adminSession,
        },
        { repository: repo }
      )
    ).resolves.toEqual({ reason: 'not_found', status: 'error' });
    expect(repo.updateRoutingRule).not.toHaveBeenCalled();
  });

  it('does not re-enable archived rules through forged actions', async () => {
    const repo = repository({
      getRoutingRule: vi.fn(async () => rule({ archivedAt: '2026-05-16T09:00:00.000Z' })),
    });

    await expect(
      runAdminCrmRoutingRuleAction(
        {
          input: { enabled: true, ruleId: 'rule-1' },
          kind: 'set_enabled',
          session: adminSession,
        },
        { repository: repo }
      )
    ).resolves.toEqual({ reason: 'not_found', status: 'error' });
    expect(repo.setRoutingRuleEnabled).not.toHaveBeenCalled();
  });

  it('treats repeated archive submissions as idempotent no-ops', async () => {
    const repo = repository({
      getRoutingRule: vi.fn(async () => rule({ archivedAt: '2026-05-16T09:00:00.000Z' })),
    });

    await expect(
      runAdminCrmRoutingRuleAction(
        {
          input: { ruleId: 'rule-1' },
          kind: 'archive',
          session: adminSession,
        },
        { repository: repo }
      )
    ).resolves.toEqual({ ruleId: 'rule-1', status: 'ok' });
    expect(repo.archiveRoutingRule).not.toHaveBeenCalled();
  });

  it('reports duplicate rule IDs with rule-specific copy on reorder', async () => {
    const repo = repository();

    await expect(
      runAdminCrmRoutingRuleAction(
        {
          input: { branchId: null, ruleIds: ['rule-1', 'rule-1'] },
          kind: 'reorder',
          session: adminSession,
        },
        { repository: repo }
      )
    ).resolves.toEqual({ field: 'ruleIds', reason: 'duplicate_rule_id', status: 'error' });
    expect(repo.reorderRoutingRules).not.toHaveBeenCalled();
  });

  it('keeps display copy mapping for every typed reason', () => {
    const reasons: AdminCrmRoutingActionErrorReason[] = [
      'invalid_strategy',
      'invalid_priority_or_cap',
      'invalid_window',
      'empty_agent_pool',
      'duplicate_agent_id',
      'duplicate_rule_id',
      'cross_tenant_agent',
      'branch_incompatible_agent',
      'invalid_branch',
      'self_referential_fallback',
      'branch_incompatible_rule',
      'archived_fallback',
      'disabled_fallback',
      'field_too_long',
      'unknown_field',
      'forbidden',
      'not_found',
      'cursor_conflict',
      'repository_failure',
    ];
    expect(reasons.map(getAdminCrmRoutingErrorMessageKey)).toEqual(
      reasons.map(() => expect.stringMatching(/^routing\.error\./))
    );
  });
});
