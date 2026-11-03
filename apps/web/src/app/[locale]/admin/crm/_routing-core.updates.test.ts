import { describe, expect, it, vi } from 'vitest';
import {
  TEST_AUTHORITY,
  adminSession,
  baseInput,
  repository,
  rule,
} from './_routing-core.test-support';
import { getAdminCrmRoutingErrorMessageKey, runAdminCrmRoutingRuleAction } from './_routing-core';
import type { AdminCrmRoutingActionErrorReason } from './_routing-types';

describe('runAdminCrmRoutingRuleAction', () => {
  it('reports unknown branch scopes with a branch-specific reason', async () => {
    const repo = repository({ listBranches: vi.fn(async () => []) });

    await expect(
      runAdminCrmRoutingRuleAction(
        {
          authority: TEST_AUTHORITY,
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
          authority: TEST_AUTHORITY,
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
          authority: TEST_AUTHORITY,
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
          authority: TEST_AUTHORITY,
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
          authority: TEST_AUTHORITY,
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
          authority: TEST_AUTHORITY,
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
          authority: TEST_AUTHORITY,
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
