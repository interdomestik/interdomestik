import { describe, expect, it } from 'vitest';

import {
  assertFinancePayability,
  assertLifecycleEligibleForCommission,
  checkOwnershipControl,
  combineControlViolations,
  guardBranchStatsScope,
} from './enterprise-controls';

describe('ownership control', () => {
  it('allows matching ownership signals', () => {
    const result = checkOwnershipControl({
      commissionId: 'comm-ok',
      subscriptionAgentId: 'agent-1',
      userAgentId: 'agent-1',
      agentClientAgentIds: ['agent-1'],
    });

    expect(result.ok).toBe(true);
  });

  it('blocks conflicting active agent-client bindings', () => {
    const result = checkOwnershipControl({
      commissionId: 'comm-bad',
      subscriptionAgentId: 'agent-1',
      userAgentId: 'agent-1',
      agentClientAgentIds: ['agent-1', 'agent-2'],
    });

    expect(result).toEqual({
      ok: false,
      violation: expect.objectContaining({
        control: 'ownership',
        code: 'OWNERSHIP_UNRESOLVED',
        recoverable: false,
        entityIds: ['comm-bad'],
      }),
    });
  });

  it('blocks drift between canonical and legacy ownership signals', () => {
    const result = checkOwnershipControl({
      commissionId: 'comm-drift',
      subscriptionAgentId: 'agent-subscription',
      userAgentId: 'agent-user',
    });

    expect(result).toEqual({
      ok: false,
      violation: expect.objectContaining({
        control: 'ownership',
        code: 'OWNERSHIP_DRIFT',
        entityIds: ['comm-drift'],
      }),
    });
  });
});

describe('lifecycle control', () => {
  it('delegates active buckets to PC05 access-active truth', () => {
    const result = assertLifecycleEligibleForCommission({
      commissionId: 'comm-active',
      subscription: { status: 'active', cancelAtPeriodEnd: false, gracePeriodEndsAt: null },
    });

    expect(result).toEqual({ ok: true, value: 'active' });
  });

  it('blocks expired grace-period subscriptions', () => {
    const result = assertLifecycleEligibleForCommission({
      commissionId: 'comm-expired',
      subscription: {
        status: 'past_due',
        cancelAtPeriodEnd: false,
        gracePeriodEndsAt: new Date('2026-04-20T00:00:00.000Z'),
      },
      now: new Date('2026-04-21T00:00:00.000Z'),
    });

    expect(result).toEqual({
      ok: false,
      violation: expect.objectContaining({
        control: 'lifecycle',
        code: 'LIFECYCLE_INELIGIBLE',
        entityIds: ['comm-expired'],
      }),
    });
  });
});

describe('branch control', () => {
  it('allows non-empty tenant and branch scope', () => {
    const result = guardBranchStatsScope({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      branchTenantId: 'tenant-1',
    });

    expect(result).toEqual({
      ok: true,
      value: { tenantId: 'tenant-1', branchId: 'branch-1' },
    });
  });

  it('blocks missing branch ids before aggregate reads', () => {
    const result = guardBranchStatsScope({ tenantId: 'tenant-1', branchId: ' ' });

    expect(result).toEqual({
      ok: false,
      violation: expect.objectContaining({
        control: 'branch',
        code: 'BRANCH_ID_MISSING',
      }),
    });
  });

  it('blocks branch tenant mismatch when the branch tenant is known', () => {
    const result = guardBranchStatsScope({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      branchTenantId: 'tenant-2',
    });

    expect(result).toEqual({
      ok: false,
      violation: expect.objectContaining({
        control: 'branch',
        code: 'BRANCH_SCOPE_MISMATCH',
        entityIds: ['branch-1'],
      }),
    });
  });
});

describe('finance control', () => {
  it('allows payable commissions when ownership and lifecycle controls pass', () => {
    const result = assertFinancePayability({
      commissionId: 'comm-payable',
      subscriptionAgentId: 'agent-1',
      userAgentId: 'agent-1',
      agentClientAgentIds: ['agent-1'],
      subscription: { status: 'active', cancelAtPeriodEnd: false, gracePeriodEndsAt: null },
    });

    expect(result.ok).toBe(true);
  });

  it('composes ownership and lifecycle violations into one finance result', () => {
    const result = assertFinancePayability({
      commissionId: 'comm-blocked',
      subscriptionAgentId: 'agent-subscription',
      userAgentId: 'agent-user',
      subscription: { status: 'canceled', cancelAtPeriodEnd: false, gracePeriodEndsAt: null },
    });

    expect(result).toEqual({
      ok: false,
      violation: expect.objectContaining({
        control: 'finance',
        code: 'FINANCE_PAYABILITY_BLOCKED',
        entityIds: ['comm-blocked'],
        causes: expect.arrayContaining([
          expect.objectContaining({ control: 'ownership' }),
          expect.objectContaining({ control: 'lifecycle' }),
        ]),
      }),
    });
  });

  it('combines mixed-batch violations with all blocked commission ids', () => {
    const violation = combineControlViolations({
      control: 'finance',
      code: 'FINANCE_BATCH_PAYABILITY_BLOCKED',
      detail: 'One or more commissions are not payable',
      violations: [
        {
          control: 'finance',
          code: 'FINANCE_PAYABILITY_BLOCKED',
          detail: 'blocked first',
          recoverable: false,
          entityIds: ['comm-a'],
        },
        {
          control: 'finance',
          code: 'FINANCE_PAYABILITY_BLOCKED',
          detail: 'blocked second',
          recoverable: false,
          entityIds: ['comm-b'],
        },
      ],
    });

    expect(violation.entityIds).toEqual(['comm-a', 'comm-b']);
    expect(violation.detail).toContain('comm-a, comm-b');
  });
});
