import { describe, expect, it } from 'vitest';

import { buildPaddleEventDispatchParams } from './paddle-event-dispatch';

describe('buildPaddleEventDispatchParams', () => {
  it('forwards signed provider ordering evidence to the lifecycle handler', () => {
    expect(
      buildPaddleEventDispatchParams({
        eventType: 'subscription.updated',
        data: {},
        tenantId: 'tenant_ks',
        processingScopeKey: 'entity:ks',
        providerEventId: 'evt_verified',
        providerEventOccurredAt: '2026-09-26T10:18:49.621022Z',
        webhookPayloadHash: 'hash',
      })
    ).toMatchObject({
      providerEventId: 'evt_verified',
      providerEventOccurredAt: '2026-09-26T10:18:49.621022Z',
    });
  });
});
