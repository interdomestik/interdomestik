import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendEvent } from '../src/domain-events';
import { makeEventTx } from './domain-event-test-utils';

function makeLegacyMembershipAgentClientBoundEvent(
  overrides: Partial<Parameters<typeof appendEvent>[1]> = {}
) {
  return {
    actor: { id: 'paddle-webhook', role: 'system' },
    aggregateVersion: 0,
    correlationId: 'corr-legacy',
    entity: { id: 'member-1', type: 'member' },
    eventName: 'membership.agent_client_bound',
    eventVersion: 1,
    id: 'event-legacy',
    payload: {
      bindingStatus: 'active',
      ownershipSource: 'checkout.customData.agentId',
    },
    tenantId: 'tenant-1',
    ...overrides,
  };
}

describe('appendEvent legacy membership binding payload allowlist', () => {
  it('allows sanitized legacy binding payload fields for replay compatibility', async () => {
    const { capture, tx } = makeEventTx();
    await appendEvent(tx, makeLegacyMembershipAgentClientBoundEvent());
    assert.deepEqual(capture.row?.payload, {
      bindingStatus: 'active',
      ownershipSource: 'checkout.customData.agentId',
    });
  });

  it('rejects unsupported legacy binding status before inserting', async () => {
    const { capture, tx } = makeEventTx();
    await assert.rejects(
      () =>
        appendEvent(
          tx,
          makeLegacyMembershipAgentClientBoundEvent({
            payload: {
              bindingStatus: 'inactive',
              ownershipSource: 'checkout.customData.agentId',
            },
          })
        ),
      /payload\.bindingStatus to be an agent-client binding status/
    );
    assert.equal(capture.row, undefined);
  });
});
