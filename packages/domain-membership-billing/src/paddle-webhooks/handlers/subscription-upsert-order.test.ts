import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  projectLockedSubscriptionOrder,
  projectReceiptLedgerOrder,
} from './provider-event-order.test-support';

type StoredRow = {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  providerSubscriptionId: string;
  providerEventOccurredAt: string | null;
  providerEventId: string | null;
};

type Staged = { row?: StoredRow; events: string[] };
type StoredReceipt = { occurredAt: string; eventId: string };

// Fake row store: `FOR UPDATE` takes a per-row lock held until the transaction
// ends, and staged writes become visible only on commit, as in Postgres.
const hoisted = vi.hoisted(() => {
  const tables = {
    subscriptions: {
      id: 'subscriptions.id',
      tenantId: 'subscriptions.tenant_id',
      status: 'subscriptions.status',
      providerSubscriptionId: 'subscriptions.provider_subscription_id',
      providerEventId: 'subscriptions.provider_event_id',
      providerEventOccurredAt: 'subscriptions.provider_event_occurred_at',
    },
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
    row: null as StoredRow | null,
    events: [] as string[],
    receipts: [] as StoredReceipt[],
    lock: Promise.resolve(),
  };

  function findRight(condition: unknown, left: string): unknown {
    if (!condition || typeof condition !== 'object') return undefined;
    const node = condition as {
      left?: unknown;
      right?: unknown;
      conditions?: unknown[];
      values?: unknown[];
    };
    if (node.left === left) return node.right;
    const sqlIndex = node.values?.indexOf(left) ?? -1;
    if (sqlIndex >= 0) return node.values?.[sqlIndex + 1];
    for (const child of node.conditions ?? []) {
      const found = findRight(child, left);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  async function transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
    let release = () => {};
    const staged: Staged = { events: [] };
    const tx = {
      staged,
      select: (shape: Record<string, unknown>) => ({
        from: (table: unknown) => ({
          where: (condition: unknown) => {
            if (table === tables.subscriptions) {
              return {
                for: async () => {
                  const previous = store.lock;
                  store.lock = new Promise<void>(resolve => (release = resolve));
                  await previous;
                  return store.row
                    ? [projectLockedSubscriptionOrder(store.row, shape.comparison)]
                    : [];
                },
              };
            }
            if (table === tables.domainEvents) {
              const id = findRight(condition, 'domain_events.id') as string;
              return { limit: async () => (store.events.includes(id) ? [{ id }] : []) };
            }
            if (table === tables.webhookEvents) {
              const incomingEventId = findRight(condition, 'webhook_events.event_id');
              const receipts = store.receipts.filter(
                receipt => receipt.eventId !== incomingEventId
              );
              return Promise.resolve([projectReceiptLedgerOrder(receipts, shape.hasNewer)]);
            }
            return Promise.resolve([{ hasInvalid: null, hasNewer: null, hasEqual: null }]);
          },
        }),
      }),
      update: () => ({
        set: (values: Partial<StoredRow>) => ({
          where: () => ({
            returning: async () => {
              staged.row = { ...store.row!, ...values };
              return [{ id: store.row!.id }];
            },
          }),
        }),
      }),
      insert: (table: unknown) => ({
        values: async (values: StoredRow) => {
          if (table !== tables.subscriptions) return;
          staged.row = values;
        },
      }),
    };
    try {
      const result = await callback(tx);
      if (staged.row) store.row = staged.row;
      store.events.push(...staged.events);
      return result;
    } finally {
      release();
    }
  }

  return {
    ...tables,
    store,
    and: (...conditions: unknown[]) => ({ op: 'and', conditions }),
    eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
    inArray: (left: unknown, right: unknown) => ({ op: 'inArray', left, right }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    appendEvent: vi.fn(async (tx: { staged: Staged }, params: { id: string }) => {
      tx.staged.events.push(params.id);
      return { id: params.id };
    }),
    db: {
      query: {
        subscriptions: {
          findFirst: vi.fn(async () => store.row),
        },
      },
      transaction: vi.fn(transaction),
    },
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

function lifecycleEvent(status: 'active' | 'canceled', occurredAt: string, eventId: string) {
  return upsertSubscription({
    existingSub: { id: 'sub_1', status: 'active', tenantId: 'tenant_ks', userId: 'user_1' },
    mappedStatus: status,
    order: { occurredAt, providerEventId: eventId, processingScopeKey: 'entity:ks' },
    planState: { planId: 'standard', planKey: null },
    providerEventId: eventId,
    sub: { id: 'sub_1', customerId: 'ctm_1', status },
    tenantId: 'tenant_ks',
    userId: 'user_1',
  });
}

const eventIdFor = (eventId: string) => `paddle:tenant_ks:${eventId}:subscription-changed`;

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.store.events = [];
  hoisted.store.receipts = [];
  hoisted.store.lock = Promise.resolve();
  hoisted.store.row = {
    id: 'sub_1',
    tenantId: 'tenant_ks',
    userId: 'user_1',
    status: 'active',
    providerSubscriptionId: 'sub_1',
    providerEventOccurredAt: '2026-09-26T09:00:00.000Z',
    providerEventId: 'evt_created',
  };
});

describe('upsertSubscription provider event order', () => {
  it('does not insert an initial row below a newer verified receipt floor', async () => {
    hoisted.store.row = null;
    hoisted.store.receipts = [{ occurredAt: T2, eventId: 'evt_newer' }];

    await expect(
      upsertSubscription({
        mappedStatus: 'active',
        order: { occurredAt: T1, providerEventId: 'evt_created', processingScopeKey: 'entity:ks' },
        planState: { planId: 'standard', planKey: null },
        providerEventId: 'evt_created',
        sub: { id: 'sub_1', customerId: 'ctm_1', status: 'active' },
        tenantId: 'tenant_ks',
        userId: 'user_1',
      })
    ).resolves.toEqual({ subscriptionId: 'sub_1', effectsApplied: false, stale: true });

    expect(hoisted.store.row).toBeNull();
    expect(hoisted.store.events).toEqual([]);
  });

  it('rejects an initial row that ties a distinct verified receipt', async () => {
    hoisted.store.row = null;
    hoisted.store.receipts = [{ occurredAt: T1, eventId: 'evt_equal' }];

    await expect(
      upsertSubscription({
        mappedStatus: 'active',
        order: { occurredAt: T1, providerEventId: 'evt_created', processingScopeKey: 'entity:ks' },
        planState: { planId: 'standard', planKey: null },
        providerEventId: 'evt_created',
        sub: { id: 'sub_1', customerId: 'ctm_1', status: 'active' },
        tenantId: 'tenant_ks',
        userId: 'user_1',
      })
    ).rejects.toThrow(PaddleEventOrderingError);

    expect(hoisted.store.row).toBeNull();
    expect(hoisted.store.events).toEqual([]);
  });

  it('inserts an initial row above an older verified receipt floor', async () => {
    hoisted.store.row = null;
    hoisted.store.receipts = [
      {
        occurredAt: '2026-09-26T10:00:00.050Z',
        eventId: 'evt_older',
      },
    ];

    await expect(
      upsertSubscription({
        mappedStatus: 'active',
        order: { occurredAt: T1, providerEventId: 'evt_created', processingScopeKey: 'entity:ks' },
        planState: { planId: 'standard', planKey: null },
        providerEventId: 'evt_created',
        sub: { id: 'sub_1', customerId: 'ctm_1', status: 'active' },
        tenantId: 'tenant_ks',
        userId: 'user_1',
      })
    ).resolves.toEqual({ subscriptionId: 'sub_1', effectsApplied: true });

    expect(hoisted.store.row).toMatchObject({
      status: 'active',
      providerEventOccurredAt: T1,
      providerEventId: 'evt_created',
    });
    expect(hoisted.store.events).toEqual([eventIdFor('evt_created')]);
  });

  it('ignores an older event received after a newer verified snapshot', async () => {
    await expect(lifecycleEvent('canceled', T2, 'evt_newer')).resolves.toEqual({
      subscriptionId: 'sub_1',
      effectsApplied: true,
    });
    await expect(lifecycleEvent('active', T1, 'evt_older')).resolves.toEqual({
      subscriptionId: 'sub_1',
      effectsApplied: false,
      stale: true,
    });

    expect(hoisted.store.row).toMatchObject({
      status: 'canceled',
      providerEventOccurredAt: T2,
      providerEventId: 'evt_newer',
    });
    expect(hoisted.store.events).toEqual([eventIdFor('evt_newer')]);
  });

  it('applies a newer event received after an older one', async () => {
    await lifecycleEvent('active', T1, 'evt_older');
    await expect(lifecycleEvent('canceled', T2, 'evt_newer')).resolves.toEqual({
      subscriptionId: 'sub_1',
      effectsApplied: true,
    });

    expect(hoisted.store.row).toMatchObject({ status: 'canceled', providerEventId: 'evt_newer' });
    expect(hoisted.store.events).toEqual([eventIdFor('evt_older'), eventIdFor('evt_newer')]);
  });

  it('keeps exact replay idempotent', async () => {
    await lifecycleEvent('canceled', T2, 'evt_newer');
    await expect(lifecycleEvent('canceled', T2, 'evt_newer')).resolves.toEqual({
      subscriptionId: 'sub_1',
      effectsApplied: false,
    });

    expect(hoisted.store.events).toEqual([eventIdFor('evt_newer')]);
  });

  it('keeps a replay of an applied-then-superseded event from being reported stale', async () => {
    await lifecycleEvent('active', T1, 'evt_older');
    await lifecycleEvent('canceled', T2, 'evt_newer');

    await expect(lifecycleEvent('active', T1, 'evt_older')).resolves.toEqual({
      subscriptionId: 'sub_1',
      effectsApplied: false,
    });
    expect(hoisted.store.row).toMatchObject({ status: 'canceled', providerEventId: 'evt_newer' });
  });

  it('rejects a distinct event at an equal occurred_at without mutating state', async () => {
    await lifecycleEvent('active', T2, 'evt_first');

    await expect(lifecycleEvent('canceled', T2, 'evt_second')).rejects.toThrow(
      PaddleEventOrderingError
    );
    expect(hoisted.store.row).toMatchObject({ status: 'active', providerEventId: 'evt_first' });
    expect(hoisted.store.events).toEqual([eventIdFor('evt_first')]);
  });

  it.each([
    ['newer locks first', ['newer', 'older']],
    ['older locks first', ['older', 'newer']],
  ] as const)('never lets a concurrent older event win when %s', async (_name, arrival) => {
    const events = {
      newer: () => lifecycleEvent('canceled', T2, 'evt_newer'),
      older: () => lifecycleEvent('active', T1, 'evt_older'),
    };

    // Both workers read the same pre-transaction row before either commits.
    const results = await Promise.all(arrival.map(kind => events[kind]()));

    expect(hoisted.store.row).toMatchObject({
      status: 'canceled',
      providerEventOccurredAt: T2,
      providerEventId: 'evt_newer',
    });
    expect(hoisted.store.events.at(-1)).toBe(eventIdFor('evt_newer'));
    expect(results[arrival.indexOf('older')]).toEqual(
      arrival[0] === 'newer'
        ? { subscriptionId: 'sub_1', effectsApplied: false, stale: true }
        : { subscriptionId: 'sub_1', effectsApplied: true }
    );
  });
});
