import { describe, expect, it } from 'vitest';

import { resolveCommissionOwnership } from './ownership';

describe('resolveCommissionOwnership', () => {
  it('returns an unresolved state when the canonical subscription owner is missing', () => {
    const result = resolveCommissionOwnership({
      userAgentId: 'agent-legacy',
      agentClientAgentIds: ['agent-legacy'],
    });

    expect(result.ownerType).toBe('unresolved');
    expect(result.agentId).toBeNull();
    expect(result.diagnostics).toEqual([
      {
        source: 'subscription.agentId',
        expectedAgentId: null,
        actualAgentId: null,
      },
    ]);
  });

  it('keeps subscriptions.agentId as the canonical owner and reports drift diagnostics', () => {
    const result = resolveCommissionOwnership({
      subscriptionAgentId: 'agent-canonical',
      userAgentId: 'agent-legacy',
      agentClientAgentIds: ['agent-legacy', 'agent-shadow'],
    });

    expect(result.ownerType).toBe('agent');
    expect(result.agentId).toBe('agent-canonical');
    expect(result.diagnostics).toEqual([
      {
        source: 'user.agentId',
        expectedAgentId: 'agent-canonical',
        actualAgentId: 'agent-legacy',
      },
      {
        source: 'agent_clients',
        expectedAgentId: 'agent-canonical',
        actualAgentIds: ['agent-legacy', 'agent-shadow'],
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
    expect(result.diagnostics).toEqual([]);
  });

  it('treats a null subscription owner as company-owned', () => {
    const result = resolveCommissionOwnership({
      subscriptionAgentId: null,
      userAgentId: 'agent-legacy',
      agentClientAgentIds: ['agent-legacy'],
    });

    expect(result.ownerType).toBe('company');
    expect(result.agentId).toBeNull();
    expect(result.diagnostics).toEqual([
      {
        source: 'user.agentId',
        expectedAgentId: null,
        actualAgentId: 'agent-legacy',
      },
      {
        source: 'agent_clients',
        expectedAgentId: null,
        actualAgentIds: ['agent-legacy'],
      },
    ]);
  });
});
