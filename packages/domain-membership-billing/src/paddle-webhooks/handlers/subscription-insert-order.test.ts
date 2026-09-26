import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projectReceiptLedgerOrder } from './provider-event-order.test-support';

type StoredReceipt = { occurredAt: string; eventId: string };

const hoisted = vi.hoisted(() => {
  const tables = {
    subscriptions: { id: 'subscriptions.id' },
    domainEvents: { id: 'domain_events.id', tenantId: 'domain_events.tenant_id' },
    webhookEvents: {
      eventId: 'webhook_events.event_id',
      eventType: 'webhook_events.event_type',
      payload: 'webhook_events.payload',
      processingResult: 'webhook_events.processing_result',
      processingScopeKey: 'webhook_events.processing_scope_key',
      provider: 'webhook_events.provider',
      signatureValid: 'webhook_events.signature_valid',
      tenantId: 'webhook_events.tenant_id',
    },
  };
  const store = {
    row: null as Record<string, unknown> | null,
    events: [] as string[],
    receipts: [] as StoredReceipt[],
  };

  async function transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
    let row: Record<string, unknown> | null = null;
    const events: string[] = [];
    const tx = {
      insert: (table: unknown) => ({
        values: async (values: Record<string, unknown>) => {
          if (table === tables.subscriptions) row = values;
        },
      }),
      select: (shape: Record<string, unknown>) => ({
        from: () => ({
          where: async () => [projectReceiptLedgerOrder(store.receipts, shape.hasNewer)],
        }),
      }),
    };
    const result = await callback(tx);
    store.row = row;
    store.events.push(...events);
    return result;
  }

  return {
    ...tables,
    store,
    and: (...conditions: unknown[]) => ({ op: 'and', conditions }),
    appendEvent: vi.fn(async (_tx: unknown, params: { id: string }) => {
      store.events.push(params.id);
      return { id: params.id };
    }),
    db: {
      query: { subscriptions: { findFirst: vi.fn().mockResolvedValue(null) } },
      transaction: vi.fn(transaction),
    },
    eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
    inArray: (left: unknown, right: unknown) => ({ op: 'inArray', left, right }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  };
});

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  appendEvent: hoisted.appendEvent,
  db: hoisted.db,
  domainEvents: hoisted.domainEvents,
  eq: hoisted.eq,
  inArray: hoisted.inArray,
  sql: hoisted.sql,
  subscriptions: hoisted.subscriptions,
  webhookEvents: hoisted.webhookEvents,
}));
vi.mock('../../subscription', () => ({ findSubscriptionByProviderReference: vi.fn() }));

import { PaddleEventOrderingError } from '../errors';
import { upsertSubscription } from './subscription-upsert';

const T1 = '2026-09-26T10:00:00.100Z';
const T2 = '2026-09-26T10:00:00.200Z';
const domainEventId = 'paddle:tenant_ks:evt_created:subscription-changed';

function insertInitialSubscription(occurredAt = T1) {
  return upsertSubscription({
    mappedStatus: 'active',
    order: { occurredAt, providerEventId: 'evt_created', processingScopeKey: 'entity:ks' },
    planState: { planId: 'standard', planKey: null },
    providerEventId: 'evt_created',
    sub: { id: 'sub_1', customerId: 'ctm_1', status: 'active' },
    tenantId: 'tenant_ks',
    userId: 'user_1',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.store.row = null;
  hoisted.store.events = [];
  hoisted.store.receipts = [];
});

describe('initial subscription provider event order', () => {
  it('does not insert below a newer verified receipt floor', async () => {
    hoisted.store.receipts = [{ occurredAt: T2, eventId: 'evt_newer' }];

    await expect(insertInitialSubscription()).resolves.toEqual({
      subscriptionId: 'sub_1',
      effectsApplied: false,
      stale: true,
    });
    expect(hoisted.store.row).toBeNull();
    expect(hoisted.store.events).toEqual([]);
  });

  it('rejects a distinct verified receipt at the same time', async () => {
    hoisted.store.receipts = [{ occurredAt: T1, eventId: 'evt_equal' }];

    await expect(insertInitialSubscription()).rejects.toThrow(PaddleEventOrderingError);
    expect(hoisted.store.row).toBeNull();
    expect(hoisted.store.events).toEqual([]);
  });

  it('inserts above an older verified receipt floor', async () => {
    hoisted.store.receipts = [{ occurredAt: '2026-09-26T10:00:00.050Z', eventId: 'evt_older' }];

    await expect(insertInitialSubscription()).resolves.toEqual({
      subscriptionId: 'sub_1',
      effectsApplied: true,
    });
    expect(hoisted.store.row).toMatchObject({
      status: 'active',
      providerEventOccurredAt: T1,
      providerEventId: 'evt_created',
    });
    expect(hoisted.store.events).toEqual([domainEventId]);
  });
});
