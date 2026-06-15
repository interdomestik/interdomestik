import { describe, expect, it } from 'vitest';

import { resolveCommissionOwnership } from './ownership';

describe('resolveCommissionOwnership', () => {
  it('falls back to active agent-client bindings when durable ownership is missing', () => {
    const result = resolveCommissionOwnership({
      agentClientAgentIds: ['agent-fallback'],
    });

    expect(result.ownerType).toBe('agent');
    expect(result.agentId).toBe('agent-fallback');
    expect(result.resolvedFrom).toBe('agent_clients');
    expect(result.diagnostics).toEqual([]);
  });

  it('prefers active bindings over stale user ownership when subscription ownership is missing', () => {
    const result = resolveCommissionOwnership({
      userAgentId: 'agent-stale',
      agentClientAgentIds: ['agent-active'],
    });

    expect(result.ownerType).toBe('agent');
    expect(result.agentId).toBe('agent-active');
    expect(result.resolvedFrom).toBe('agent_clients');
    expect(result.diagnostics).toEqual([]);
  });

  it('prefers subscription ownership over read-scope bindings and reports active binding drift', () => {
    const result = resolveCommissionOwnership({
      subscriptionAgentId: 'agent-canonical',
      userAgentId: 'agent-legacy',
      agentClientAgentIds: ['agent-current'],
    });

    expect(result.ownerType).toBe('agent');
    expect(result.agentId).toBe('agent-canonical');
    expect(result.resolvedFrom).toBe('subscription.agentId');
    expect(result.diagnostics).toEqual([
      {
        source: 'user.agentId',
        expectedAgentId: 'agent-canonical',
        actualAgentId: 'agent-legacy',
      },
      {
        source: 'agent_clients',
        expectedAgentId: 'agent-canonical',
        actualAgentIds: ['agent-current'],
      },
    ]);
  });

  it('returns an empty diagnostics list when all ownership signals match', () => {
    const result = resolveCommissionOwnership({
      subscriptionAgentId: 'agent-canonical',
      userAgentId: 'agent-canonical',
      agentClientAgentIds: ['agent-canonical'],
    });

    expect(result.ownerType).toBe('agent');
    expect(result.agentId).toBe('agent-canonical');
    expect(result.resolvedFrom).toBe('subscription.agentId');
    expect(result.diagnostics).toEqual([]);
  });

  it('does not let an empty active binding set override durable agent ownership', () => {
    const result = resolveCommissionOwnership({
      subscriptionAgentId: 'agent-canonical',
      userAgentId: 'agent-canonical',
      agentClientAgentIds: [],
    });

    expect(result.ownerType).toBe('agent');
    expect(result.agentId).toBe('agent-canonical');
    expect(result.resolvedFrom).toBe('subscription.agentId');
    expect(result.diagnostics).toEqual([]);
  });

  it('treats an explicit durable null subscription owner as company-owned', () => {
    const result = resolveCommissionOwnership({
      subscriptionAgentId: null,
      userAgentId: 'agent-legacy',
      agentClientAgentIds: [],
    });

    expect(result.ownerType).toBe('company');
    expect(result.agentId).toBeNull();
    expect(result.resolvedFrom).toBe('subscription.agentId');
    expect(result.diagnostics).toEqual([
      {
        source: 'user.agentId',
        expectedAgentId: null,
        actualAgentId: 'agent-legacy',
      },
    ]);
  });

  it('returns unresolved when multiple active agent bindings disagree', () => {
    const result = resolveCommissionOwnership({
      subscriptionAgentId: 'agent-canonical',
      userAgentId: 'agent-canonical',
      agentClientAgentIds: ['agent-a', 'agent-b'],
    });

    expect(result.ownerType).toBe('unresolved');
    expect(result.agentId).toBeNull();
    expect(result.resolvedFrom).toBe('agent_clients');
    expect(result.diagnostics).toEqual([
      {
        source: 'agent_clients',
        expectedAgentId: null,
        actualAgentIds: ['agent-a', 'agent-b'],
      },
    ]);
  });
});
