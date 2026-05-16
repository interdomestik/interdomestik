import { describe, expect, it } from 'vitest';

import { assertNoAdminCrmRoutingPiiKeys } from './_routing-core';
import type { AdminCrmRoutingRuleSummary } from './_routing-types';

describe('admin CRM routing PII shape', () => {
  it('allows only aggregate routing-rule summary fields', () => {
    const summary: AdminCrmRoutingRuleSummary = {
      agentPoolCount: 2,
      archived: false,
      capacityCaps: {
        maxNewLeadsPerAgentPerDay: null,
        maxOpenLeadsPerAgent: 12,
      },
      effectiveWindow: { from: null, to: null },
      enabled: true,
      fallback: { agentId: 'agent-1', ruleId: null },
      filters: {
        leadType: null,
        source: 'website',
        utmCampaign: null,
        utmMedium: null,
        utmSource: null,
      },
      id: 'rule-1',
      priority: 0,
      scope: { kind: 'tenant' },
      strategy: 'round_robin',
      updatedAt: '2026-05-16T08:00:00.000Z',
    };

    expect(() => assertNoAdminCrmRoutingPiiKeys(summary)).not.toThrow();
  });

  it('rejects forbidden PII-shaped keys', () => {
    expect(() =>
      assertNoAdminCrmRoutingPiiKeys({
        email: 'agent@example.com',
        id: 'rule-1',
      })
    ).toThrow('PII key: email');
  });
});
