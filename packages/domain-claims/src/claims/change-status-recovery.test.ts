import { mocks, statusTransaction } from './change-status.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { changeClaimStatus } from './change-status';
import { claimFixture } from './lifecycle-test-support';

const tenant = 'tenant-1';
const owner = { id: 'member-1', emailVerified: false, role: 'agent' };
const subscription = { id: 'sub-1', planKey: 'plan-1' };
const claim = claimFixture('evaluation', {
  title: 'Test claim',
  staffId: 'staff-1',
  category: 'property',
  lifecycleVersion: 6,
});
const agreement = {
  acceptedAt: new Date('2026-11-21T09:00:00Z'),
  signedAt: new Date('2026-11-21T09:00:00Z'),
  decisionType: 'accepted',
  decisionNextStatus: 'negotiation',
  feePercentage: 15,
  legalActionCapPercentage: 25,
  minimumFee: '10.00',
  termsVersion: 'v1',
  paymentAuthorizationState: 'authorized',
  successFeeCollectionMethod: 'invoice',
  successFeeDeductionAllowed: false,
  successFeeHasStoredPaymentMethod: false,
  successFeeInvoiceDueAt: new Date('2026-11-24T09:00:00Z'),
  successFeeResolvedAt: new Date('2026-11-21T09:00:00Z'),
  successFeeRecoveredAmount: '250.00',
  successFeeAmount: '37.50',
  successFeeCurrencyCode: 'EUR',
};

const rows = {
  'join:claim': [{ userId: owner.id, subscriptionId: subscription.id }],
  'read:claim:no key update': [claim],
  'read:claim_escalation_agreements:share': [agreement],
  'read:subscriptions': [subscription],
  'read:subscriptions:share': [subscription],
  'read:user:share': [owner],
  'read:service_usage:count': [{ count: 1 }],
};

function negotiate(role = 'staff', extra = {}) {
  const authority = mintTestTenantAuthority(tenant, { userId: 'staff-1', role });
  return changeClaimStatus(
    authority,
    { claimId: 'claim-1', toStatus: 'negotiation', ...extra },
    { hostId: null }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('claim recovery status prerequisites', () => {
  it.each(['staff', 'tenant_admin'])(
    'uses the same prerequisites and lock order for %s',
    async role => {
      const trace = statusTransaction(rows);
      expect(await negotiate(role)).toMatchObject({ ok: true, changed: true });
      expect(trace.operations).toEqual([
        'join:claim',
        'lock:allowance',
        'read:claim:no key update',
        'read:subscriptions',
        'read:claim_escalation_agreements:share',
        'lock:sponsor',
        'read:user:share',
        'read:subscriptions:share',
        'read:membership_plans:share',
        'read:clock',
        'read:coverage',
        'read:service_usage',
        'read:service_usage:count',
        'lock:no-fee',
        'read:user:share',
        'update:claim',
        'insert:claim_stage_history',
        'insert:domain_events',
        'insert:domain_events',
        'insert:domain_events',
        'insert:service_usage',
        'insert:audit_log',
        'insert:notifications',
        'insert:notification_preview_restrictions',
        'read:user_notification_preferences',
        'read:push_subscriptions',
        'update:claim_response_requests',
        'commit',
      ]);
      expect(mocks.resolveMembership).toHaveBeenCalledWith(
        expect.anything(),
        tenant,
        [owner.id],
        trace.fixedTime
      );
      expect(trace.conditions['lock:allowance'].params).toEqual([
        JSON.stringify(['recovery', tenant, subscription.id]),
      ]);
      expect(trace.conditions['read:service_usage']?.params).toContain(
        'staff_recovery_matter:claim-1'
      );
      expect(trace.writes.service_usage).toEqual([
        expect.objectContaining({
          tenantId: tenant,
          subscriptionId: subscription.id,
          userId: owner.id,
          usedAt: trace.fixedTime,
        }),
      ]);
    }
  );

  it.each([
    { scope: 'decision', override: { 'read:claim_escalation_agreements:share': [] } },
    {
      scope: 'decision',
      override: {
        'read:claim_escalation_agreements:share': [{ ...agreement, decisionType: null }],
      },
    },
    {
      scope: 'agreement',
      override: { 'read:claim_escalation_agreements:share': [{ ...agreement, signedAt: null }] },
    },
    {
      scope: 'collection_path',
      override: {
        'read:claim_escalation_agreements:share': [
          { ...agreement, successFeeCollectionMethod: null },
        ],
      },
    },
    {
      scope: 'commercial_scope',
      override: { 'read:claim:no key update': [{ ...claim, category: 'travel' }] },
    },
    { scope: 'allowance', override: { 'read:service_usage:count': [{ count: 2 }] } },
  ])('requires $scope even for the admin family', async ({ scope, override }) => {
    const trace = statusTransaction({ ...rows, ...override });
    expect(await negotiate('tenant_admin')).toEqual({
      ok: false,
      code: `recovery_prerequisite:${scope}`,
    });
    expect(trace.writes).toEqual({});
    expect(trace.operations.at(-1)).toBe('rollback');
  });

  it('requires effective membership even if an allowance subscription row exists', async () => {
    const trace = statusTransaction(rows);
    mocks.resolveMembership.mockResolvedValueOnce(new Map());
    expect(await negotiate()).toEqual({ ok: false, code: 'recovery_prerequisite:membership' });
    expect(trace.writes).toEqual({});
  });

  it('refuses new usage at the exclusive end of the ordinary period even with an override', async () => {
    const trace = statusTransaction(rows);
    mocks.resolveMembership.mockResolvedValueOnce(
      new Map([
        [
          owner.id,
          {
            source: 'subscription',
            subscription: {
              ...subscription,
              currentPeriodStart: '2025-11-22T10:00:00Z',
              currentPeriodEnd: trace.fixedTime,
            },
          },
        ],
      ])
    );

    expect(await negotiate('staff', { allowanceOverrideReason: 'Capacity override' })).toEqual({
      ok: false,
      code: 'recovery_prerequisite:allowance',
    });
    expect(trace.operations).not.toContain('read:service_usage:count');
    expect(trace.writes).toEqual({});
  });

  it('does not acquire a second allowance lock if the subscription changed while waiting', async () => {
    const trace = statusTransaction({
      ...rows,
      'read:subscriptions:share': [{ id: 'sub-new', planKey: null }],
    });
    expect(await negotiate()).toEqual({ ok: false, code: 'conflict' });
    expect(trace.operations.filter(operation => operation === 'lock:allowance')).toHaveLength(1);
    expect(trace.operations).not.toContain('read:coverage');
    expect(trace.writes).toEqual({});
  });

  it('preserves the allowance override for staff and does not consume the same matter twice', async () => {
    const overrideTrace = statusTransaction({
      ...rows,
      'read:service_usage:count': [{ count: 2 }],
    });
    expect(
      await negotiate('staff', { allowanceOverrideReason: 'Early start approved' })
    ).toMatchObject({ ok: true });
    expect(overrideTrace.writes.service_usage).toHaveLength(1);
    const replayTrace = statusTransaction({
      ...rows,
      'read:service_usage:count': [{ count: 2 }],
      'read:service_usage': [{ id: 'previous-use' }],
    });
    expect(await negotiate()).toMatchObject({ ok: true });
    expect(replayTrace.writes.service_usage).toBeUndefined();
  });
});
