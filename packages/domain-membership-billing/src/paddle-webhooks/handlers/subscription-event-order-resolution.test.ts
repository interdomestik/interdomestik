import { describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/database', () => ({
  and: vi.fn(),
  domainEvents: {},
  eq: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
  subscriptions: {},
  webhookEvents: {},
}));

import { PaddleEventOrderingError } from '../errors';
import { resolveSubscriptionEventOrder } from './subscription-event-order';

describe('resolveSubscriptionEventOrder', () => {
  it('leaves the unscoped legacy route unchanged', () => {
    expect(
      resolveSubscriptionEventOrder({
        processingScopeKey: 'tenant:tenant_ks',
        providerSubscriptionId: 'sub_1',
      })
    ).toBeUndefined();
  });

  it('returns signed ordering evidence for the entity-scoped path', () => {
    expect(
      resolveSubscriptionEventOrder({
        processingScopeKey: 'entity:ks',
        providerEventId: ' evt_1 ',
        providerEventOccurredAt: '2026-09-26T10:00:00.000001Z',
        providerSubscriptionId: 'sub_1',
      })
    ).toEqual({
      occurredAt: '2026-09-26T10:00:00.000001Z',
      providerEventId: 'evt_1',
      processingScopeKey: 'entity:ks',
    });
  });

  it.each([
    { providerEventId: 'evt_1', providerEventOccurredAt: undefined },
    { providerEventId: 'evt_1', providerEventOccurredAt: null },
    { providerEventId: 'evt_1', providerEventOccurredAt: '2026-02-30T00:00:00Z' },
    { providerEventId: 'evt_1', providerEventOccurredAt: 'yesterday' },
    { providerEventId: undefined, providerEventOccurredAt: '2026-09-26T10:00:00Z' },
    { providerEventId: '  ', providerEventOccurredAt: '2026-09-26T10:00:00Z' },
  ])('fails closed as a permanent ordering error for %o', evidence => {
    expect(() =>
      resolveSubscriptionEventOrder({
        processingScopeKey: 'entity:ks',
        providerSubscriptionId: 'sub_1',
        ...evidence,
      })
    ).toThrow(PaddleEventOrderingError);
  });
});
