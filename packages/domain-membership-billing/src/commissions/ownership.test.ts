import { describe, expect, it } from 'vitest';

import { resolveCommissionOwnership } from './ownership';

describe('resolveCommissionOwnership', () => {
  it('returns an unresolved state when the canonical subscription owner is missing', () => {
    const result = resolveCommissionOwnership({
      userAgentId: 'agent-legacy',
      agentClientAgentIds: ['agent-legacy'],
    });

    expect(result.ownerType).toBe('agent');
    expect(result.agentId).toBe('agent-legacy');
    expect(result.resolvedFrom).toBe('agent_clients');
    expect(result.diagnostics).toEqual([]);
  });

  it('prefers agent_clients as the canonical owner and reports drift on older sources', () => {
    const result = resolveCommissionOwnership({
      subscriptionAgentId: 'agent-canonical',
      userAgentId: 'agent-legacy',
      agentClientAgentIds: ['agent-current'],
    });

    expect(result.ownerType).toBe('agent');
    expect(result.agentId).toBe('agent-current');
    expect(result.resolvedFrom).toBe('agent_clients');
    expect(result.diagnostics).toEqual([
      {
        source: 'subscription.agentId',
        expectedAgentId: 'agent-current',
        actualAgentId: 'agent-canonical',
      },
      {
        source: 'user.agentId',
        expectedAgentId: 'agent-current',
        actualAgentId: 'agent-legacy',
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
    expect(result.resolvedFrom).toBe('agent_clients');
    expect(result.diagnostics).toEqual([]);
  });

  it('treats an empty active binding set as company-owned even when older sources are stale', () => {
    const result = resolveCommissionOwnership({
      subscriptionAgentId: null,
      userAgentId: 'agent-legacy',
      agentClientAgentIds: [],
    });

    expect(result.ownerType).toBe('company');
    expect(result.agentId).toBeNull();
    expect(result.resolvedFrom).toBe('agent_clients');
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
