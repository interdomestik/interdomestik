import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaddleWebhookAuditDeps, PaddleWebhookDeps } from '../types';
import { pastDue, T1, T2 } from './dunning-order.test-support';

type StoredRow = {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  providerSubscriptionId: string;
  providerEventOccurredAt: string | null;
  providerEventId: string | null;
  dunningAttemptCount: number | null;
  pastDueAt: Date | null;
  gracePeriodEndsAt: Date | null;
};

// Fake row store: `FOR UPDATE` holds a per-row lock until the transaction ends and
// staged writes become visible only on commit, as in Postgres.
const hoisted = vi.hoisted(() => {
  const subscriptions = {
    id: 'subscriptions.id',
    tenantId: 'subscriptions.tenant_id',
    userId: 'subscriptions.user_id',
    status: 'subscriptions.status',
    providerSubscriptionId: 'subscriptions.provider_subscription_id',
    providerEventId: 'subscriptions.provider_event_id',
    providerEventOccurredAt: 'subscriptions.provider_event_occurred_at',
    dunningAttemptCount: 'subscriptions.dunning_attempt_count',
    pastDueAt: 'subscriptions.past_due_at',
    gracePeriodEndsAt: 'subscriptions.grace_period_ends_at',
  };
  const store = { row: null as StoredRow | null, lock: Promise.resolve() };

  function findTimestamp(value: unknown): string | undefined {
    if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}T/.test(value) ? value : undefined;
    if (!value || typeof value !== 'object') return undefined;
    for (const nested of Object.values(value)) {
      const found = findTimestamp(nested);
      if (found) return found;
    }
    return undefined;
  }

  function lockedProjection(row: StoredRow, shape: Record<string, unknown>) {
    const incoming = Date.parse(findTimestamp(shape.comparison)!);
    const marker = row.providerEventOccurredAt ? Date.parse(row.providerEventOccurredAt) : null;
    const comparison =
      marker === null
        ? null
        : incoming > marker
          ? 'newer'
          : incoming === marker
            ? 'equal'
            : 'older';
    return {
      status: row.status,
      providerSubscriptionId: row.providerSubscriptionId,
      providerEventId: row.providerEventId,
      comparison,
    };
  }

  async function transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
    let release = () => {};
    let staged: StoredRow | undefined;
    const tx = {
      select: (shape: Record<string, unknown>) => ({
        from: (table: unknown) => ({
          where: () => {
            if (table !== subscriptions) {
              return Promise.resolve([{ hasInvalid: null, hasNewer: null, hasEqual: null }]);
            }
            if ('comparison' in shape) {
              return {
                for: async () => {
                  const previous = store.lock;
                  store.lock = new Promise<void>(resolve => (release = resolve));
                  await previous;
                  return store.row ? [lockedProjection(store.row, shape)] : [];
                },
              };
            }
            return Promise.resolve(store.row ? [{ ...store.row }] : []);
          },
        }),
      }),
      update: () => ({
        set: (values: Partial<StoredRow>) => ({
          where: () => ({
            returning: async () => {
              staged = { ...store.row!, ...values };
              return [{ id: store.row!.id }];
            },
          }),
        }),
      }),
    };
    try {
      const result = await callback(tx);
      if (staged) store.row = staged;
      return result;
    } finally {
      release();
    }
  }

  return {
    subscriptions,
    store,
    and: (...conditions: unknown[]) => ({ op: 'and', conditions }),
    eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
    inArray: (left: unknown, right: unknown) => ({ op: 'inArray', left, right }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    db: {
      transaction: vi.fn(transaction),
      insert: vi.fn(),
      update: vi.fn(),
      query: { user: { findFirst: vi.fn() }, subscriptions: { findFirst: vi.fn() } },
    },
    findSubscriptionByProviderReference: vi.fn(),
  };
});

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  db: hoisted.db,
  domainEvents: { id: 'domain_events.id', tenantId: 'domain_events.tenant_id' },
  eq: hoisted.eq,
  inArray: hoisted.inArray,
  sql: hoisted.sql,
  subscriptions: hoisted.subscriptions,
  webhookEvents: { payload: 'webhook_events.payload' },
}));
vi.mock('../../subscription', () => ({
  findSubscriptionByProviderReference: hoisted.findSubscriptionByProviderReference,
}));
vi.mock('../../annual-membership', () => ({
  createCanonicalMembershipPlanState: (planId: string, planKey?: string | null) => ({
    planId,
    ...(planKey ? { planKey } : {}),
  }),
  resolveCanonicalMembershipPlanState: vi.fn(async () => ({ planId: 'standard', planKey: null })),
}));

import { PaddleEventOrderingError, RetryablePaddleWebhookError } from '../errors';
import { handleSubscriptionPastDue } from './dunning';

function seed(status: string, markerAt: string, markerEventId: string) {
  hoisted.store.row = {
    id: 'sub_1',
    tenantId: 'tenant_ks',
    userId: 'user_1',
    status,
    providerSubscriptionId: 'sub_1',
    providerEventOccurredAt: markerAt,
    providerEventId: markerEventId,
    dunningAttemptCount: 0,
    pastDueAt: null,
    gracePeriodEndsAt: null,
  };
}

let deps: Required<Pick<PaddleWebhookDeps, 'sendPaymentFailedEmail'>> &
  Required<PaddleWebhookAuditDeps>;

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.store.lock = Promise.resolve();
  hoisted.findSubscriptionByProviderReference.mockImplementation(async () =>
    hoisted.store.row ? { ...hoisted.store.row } : null
  );
  hoisted.db.query.user.findFirst.mockResolvedValue({
    id: 'user_1',
    email: 'member@example.com',
    name: 'Member',
    tenantId: 'tenant_ks',
  });
  deps = {
    logAuditEvent: vi.fn(),
    sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
  };
});

describe('handleSubscriptionPastDue entity-scoped provider event order', () => {
  it.each(['active', 'canceled'])(
    'ignores an older past_due after a newer %s snapshot without dunning effects',
    async status => {
      seed(status, T2, 'evt_newer');

      await expect(handleSubscriptionPastDue(pastDue(T1, 'evt_older'), deps)).resolves.toBe(
        undefined
      );

      expect(hoisted.store.row).toMatchObject({
        status,
        dunningAttemptCount: 0,
        providerEventOccurredAt: T2,
        providerEventId: 'evt_newer',
      });
      expect(deps.logAuditEvent).not.toHaveBeenCalled();
      expect(deps.sendPaymentFailedEmail).not.toHaveBeenCalled();
    }
  );

  it('applies a newer past_due after an older state with one dunning effect set', async () => {
    seed('active', T1, 'evt_older');

    await handleSubscriptionPastDue(pastDue(T2, 'evt_past_due'), deps);

    expect(hoisted.store.row).toMatchObject({
      status: 'past_due',
      dunningAttemptCount: 1,
      providerEventOccurredAt: T2,
      providerEventId: 'evt_past_due',
    });
    expect(hoisted.store.row?.pastDueAt).toBeInstanceOf(Date);
    expect(deps.logAuditEvent).toHaveBeenCalledTimes(1);
    expect(deps.sendPaymentFailedEmail).toHaveBeenCalledTimes(1);
    expect(hoisted.findSubscriptionByProviderReference).toHaveBeenCalledWith('sub_1', {
      tenantId: 'tenant_ks',
    });
  });

  it('does not increment, audit or email again on exact replay', async () => {
    seed('active', T1, 'evt_older');
    await handleSubscriptionPastDue(pastDue(T2, 'evt_past_due'), deps);

    await handleSubscriptionPastDue(pastDue(T2, 'evt_past_due'), deps);

    expect(hoisted.store.row).toMatchObject({
      dunningAttemptCount: 1,
      providerEventId: 'evt_past_due',
    });
    expect(deps.logAuditEvent).toHaveBeenCalledTimes(1);
    expect(deps.sendPaymentFailedEmail).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a distinct event at an equal occurred_at', async () => {
    seed('active', T2, 'evt_active');

    await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_past_due'), deps)).rejects.toThrow(
      PaddleEventOrderingError
    );
    expect(hoisted.store.row).toMatchObject({ status: 'active', dunningAttemptCount: 0 });
    expect(deps.logAuditEvent).not.toHaveBeenCalled();
    expect(deps.sendPaymentFailedEmail).not.toHaveBeenCalled();
  });

  it.each([undefined, 'not-a-time'])(
    'fails closed before any lookup when occurred_at is %s',
    async occurredAt => {
      seed('active', T1, 'evt_older');

      await expect(
        handleSubscriptionPastDue(pastDue(occurredAt, 'evt_past_due'), deps)
      ).rejects.toThrow(PaddleEventOrderingError);
      expect(hoisted.findSubscriptionByProviderReference).not.toHaveBeenCalled();
      expect(hoisted.db.transaction).not.toHaveBeenCalled();
    }
  );

  it('never creates or replaces a first row from an entity past_due', async () => {
    hoisted.store.row = null;

    await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_past_due'), deps)).rejects.toThrow(
      RetryablePaddleWebhookError
    );
    expect(hoisted.db.transaction).not.toHaveBeenCalled();
    expect(hoisted.db.insert).not.toHaveBeenCalled();
    expect(hoisted.db.update).not.toHaveBeenCalled();
    expect(deps.sendPaymentFailedEmail).not.toHaveBeenCalled();
  });

  it('never lets a concurrent older past_due count or email twice', async () => {
    seed('active', T1, 'evt_active');

    await Promise.all([
      handleSubscriptionPastDue(pastDue('2026-09-26T10:00:00.300Z', 'evt_newest'), deps),
      handleSubscriptionPastDue(pastDue(T2, 'evt_newer'), deps),
    ]);

    expect(hoisted.store.row).toMatchObject({
      status: 'past_due',
      dunningAttemptCount: 1,
      providerEventId: 'evt_newest',
    });
    expect(deps.logAuditEvent).toHaveBeenCalledTimes(1);
    expect(deps.sendPaymentFailedEmail).toHaveBeenCalledTimes(1);
  });
});
