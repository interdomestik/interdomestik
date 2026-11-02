import type { IngressCapability } from '@interdomestik/database/ingress';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it } from 'vitest';

import { buildPaddleEventDispatchParams } from './paddle-event-dispatch';

describe('buildPaddleEventDispatchParams', () => {
  const delivery = Object.freeze({}) as IngressCapability<'paddle-delivery'>;

  it('forwards the verified delivery and tenant authority to the handlers', () => {
    const authority = mintTestTenantAuthority('tenant_ks');
    const params = buildPaddleEventDispatchParams({
      eventType: 'subscription.updated',
      data: {},
      delivery,
      authority,
      processingScopeKey: 'entity:ks',
      providerEventId: 'evt_verified',
      providerEventOccurredAt: null,
      webhookPayloadHash: 'hash',
    });

    expect(params.delivery).toBe(delivery);
    expect(params.authority).toBe(authority);
    expect(params).not.toHaveProperty('tenantId');
  });

  it('forwards signed provider ordering evidence to the lifecycle handler', () => {
    expect(
      buildPaddleEventDispatchParams({
        eventType: 'subscription.updated',
        data: {},
        delivery,
        authority: null,
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
