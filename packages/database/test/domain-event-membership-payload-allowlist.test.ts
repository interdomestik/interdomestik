import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendEvent } from '../src/domain-events';
import { makeEventTx } from './domain-event-test-utils';

function makeMembershipAttributionRecordedEvent(
  overrides: Partial<Parameters<typeof appendEvent>[1]> = {}
) {
  return {
    actor: { id: 'paddle-webhook', role: 'system' },
    aggregateVersion: 0,
    correlationId: 'corr-1',
    entity: { id: 'member-1', type: 'member' },
    eventName: 'membership.agent_attribution_recorded',
    eventVersion: 1,
    id: 'event-1',
    payload: {
      ownershipSource: 'checkout.customData.agentId',
      readScopeGranted: false,
    },
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function makeMembershipSubscriptionChangedEvent(
  overrides: Partial<Parameters<typeof appendEvent>[1]> = {}
) {
  return {
    actor: { id: 'paddle-webhook', role: 'system' },
    aggregateVersion: 0,
    correlationId: 'corr-2',
    entity: { id: 'sub-1', type: 'subscription' },
    eventName: 'membership.subscription_changed',
    eventVersion: 1,
    id: 'event-2',
    payload: { cancelAtPeriodEnd: false, fromStatus: 'none', toStatus: 'active' },
    tenantId: 'tenant-1',
    ...overrides,
  };
}

describe('appendEvent membership payload allowlist', () => {
  for (const [name, event, error] of [
    [
      'inline member identifiers',
      makeMembershipAttributionRecordedEvent({
        payload: {
          memberEmail: 'member@example.invalid',
          ownershipSource: 'checkout.customData.agentId',
          readScopeGranted: false,
        },
      }),
      /memberEmail is not allowlisted/,
    ],
    [
      'inline agent identifiers',
      makeMembershipAttributionRecordedEvent({
        payload: {
          agentId: 'agent-1',
          ownershipSource: 'checkout.customData.agentId',
          readScopeGranted: false,
        },
      }),
      /agentId is not allowlisted/,
    ],
    [
      'unsupported ownership source',
      makeMembershipAttributionRecordedEvent({
        payload: { ownershipSource: 'paddle.customData', readScopeGranted: false },
      }),
      /payload\.ownershipSource to be a membership ownership source/,
    ],
    [
      'non-boolean read scope marker',
      makeMembershipAttributionRecordedEvent({
        payload: {
          ownershipSource: 'checkout.customData.agentId',
          readScopeGranted: 'false',
        },
      }),
      /payload\.readScopeGranted to be a boolean/,
    ],
    [
      'extra subscription fields',
      makeMembershipSubscriptionChangedEvent({
        payload: {
          cancelAtPeriodEnd: false,
          fromStatus: 'none',
          memberEmail: 'member@example.invalid',
          toStatus: 'active',
        },
      }),
      /memberEmail is not allowlisted/,
    ],
    [
      'unsupported subscription status',
      makeMembershipSubscriptionChangedEvent({
        payload: { cancelAtPeriodEnd: false, fromStatus: 'pending', toStatus: 'active' },
      }),
      /payload\.fromStatus to be a membership subscription status/,
    ],
  ] as const) {
    it(`rejects ${name} before inserting`, async () => {
      const { capture, tx } = makeEventTx();
      await assert.rejects(() => appendEvent(tx, event), error);
      assert.equal(capture.row, undefined);
    });
  }

  it('allows sanitized read-only membership attribution payload fields', async () => {
    const { capture, tx } = makeEventTx();
    await appendEvent(tx, makeMembershipAttributionRecordedEvent());
    assert.deepEqual(capture.row?.payload, {
      ownershipSource: 'checkout.customData.agentId',
      readScopeGranted: false,
    });
  });

  it('allows sanitized subscription changed payload fields', async () => {
    const { capture, tx } = makeEventTx();
    await appendEvent(tx, makeMembershipSubscriptionChangedEvent());
    assert.deepEqual(capture.row?.payload, {
      cancelAtPeriodEnd: false,
      fromStatus: 'none',
      toStatus: 'active',
    });
  });
});
